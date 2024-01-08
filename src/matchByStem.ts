import { getStemmerByLocale, type Stemmer } from './deps.ts'
import { highFreqWords } from './highFreqWords.ts'
import type {
	_MatchInfo,
	Granularity,
	LocaleUtils,
	MatchByStemAsyncParams,
	MatchByStemParams,
	PartialMatch,
} from './types.ts'
import { wrapTransforms } from './_wrapTransforms.ts'

const PHRASE_DELIMITER_RE = /[\r\n.,:;。，、：；()\[\]（）【】]/u

async function getLocaleUtils(locale: Intl.Locale): Promise<LocaleUtils> {
	const Stemmer = await getStemmerByLocale(locale)
	const stemmer: Stemmer = Stemmer ? new Stemmer() : {
		stemWord(word: string) {
			return word
		},
	}

	const segmenters = new Map<Granularity, Intl.Segmenter>()

	const segment = (text: string, granularity?: Granularity) => {
		if (!segmenters.has(granularity)) {
			segmenters.set(granularity, new Intl.Segmenter(String(locale), { granularity }))
		}

		return segmenters.get(granularity)!.segment(text)
	}

	return { locale, stemmer, segment }
}

export async function createMatcherAsync({ locale, ...params }: MatchByStemAsyncParams) {
	return createMatcher({ ...params, localeUtils: await getLocaleUtils(locale) })
}

export function createMatcher({ keywords, localeUtils, transforms }: MatchByStemParams) {
	const { locale } = localeUtils
	const fns = wrapTransforms(transforms)

	const nonStopWords = new Set(keywords.flatMap((x) => {
		const wordSegs = [...localeUtils.segment(x, 'word')]
		return [
			wordSegs.find((x) => x.isWordLike)?.segment,
			wordSegs.findLast((x) => x.isWordLike)?.segment,
		].filter(Boolean) as string[]
	}))

	const getStemData = _getStemData(localeUtils, nonStopWords)

	const kwdStemData = keywords.map(getStemData)

	return (text: string) => {
		const inputTextStems = getStemData(text /* .replaceAll(/\n{3,}/g, '\n\n') */).stems

		const out: (string | string[])[] = []
		const partialMatches: PartialMatch[] = []
		const matches: _MatchInfo[] = []

		outerLoop: for (const [inputIdx, { segment, stem }] of inputTextStems.entries()) {
			out.push(segment)

			// ignore stop-words and non-words
			if (!stem) continue outerLoop

			matchesLoop: for (let i = 0; i < partialMatches.length; ++i) {
				const partial = partialMatches[i]

				// deno-lint-ignore no-unused-labels
				stemsLoop: for (const [sIdx, s] of partial.stems.entries()) {
					if (s.stem === stem) {
						partial.stems.splice(sIdx, 1)

						if (!partial.stems.length) {
							const { start, text } = partial
							const exact = inputTextStems.slice(start, inputIdx + 1).map((x) => x.segment).join('')

							if (
								[...localeUtils.segment(exact, 'sentence')].length > 1 ||
								PHRASE_DELIMITER_RE.test(exact)
							) {
								// break early as we've already crossed a sentence or phrase boundary
								continue matchesLoop
							}

							matches.push({
								start,
								end: inputIdx,
								matched: text,
								exact,
							})

							// // uncomment to disallow overlaps on first pass
							// partialMatches.length = 0
							// continue outerLoop
						} else {
							continue matchesLoop
						}
					}
				} // </stemsLoop>

				// if not continued yet (i.e. no stems matched within stemsLoop)...
				// ...then we remove that partial match...
				partialMatches.splice(i, 1) // ...and decrement idx by 1 (arr size has decreased by 1)
				;--i
			} // </matchesLoop>

			for (const { text, stems } of kwdStemData) {
				for (const [idx, s] of stems.entries()) {
					if (s.stem === stem) {
						const partial = [...stems.slice(0, idx), ...stems.slice(idx + 1)]
							// ignore stop-words and non-words
							.filter((x) => x.stem)

						if (partial.length) {
							// multi-word keyword, rest is handled within `outerLoop` above
							partialMatches.push({ start: inputIdx, stems: partial, text })
						} else {
							// single-word keyword
							matches.push({
								start: inputIdx,
								end: inputIdx,
								matched: text,
								exact: inputTextStems[inputIdx].segment,
							})
						}

						break
					}
				}
			}
		} // </outerLoop>

		const counts = new Map<string, number>()

		const sorters: ((x: _MatchInfo) => number)[] = [
			(x) => (counts.get(x.matched) ?? 0),
			(x) => -Number(normalizeSubtle(x.exact, locale) === normalizeSubtle(x.matched, locale)),
			(x) => x.start,
			(x) => -[...x.matched].length,
		]

		const sortReverse = (a: _MatchInfo, b: _MatchInfo) =>
			sorters.reduce((acc, sorter) => acc || sorter(b) - sorter(a), 0)

		while (matches.length) {
			// sort reversed in-place and `pop` from end (better perf than `shift`)
			matches.sort(sortReverse)
			const m = matches.pop()!
			const { start, end, matched } = m

			if (out.slice(start, end + 1).some((x) => typeof x !== 'string')) {
				// overlaps existing
				continue
			}

			const count = counts.get(matched) ?? 0
			// if (numInstances) continue

			const s = out[start] as string
			const e = out[end] as string

			if (start === end) {
				out[start] = [fns.startTag({ ...m, count }), fns.content(s), fns.endTag({ ...m, count })]
			} else {
				out[start] = [fns.startTag({ ...m, count }), fns.content(s)]
				out[end] = [fns.content(e), fns.endTag({ ...m, count })]
			}

			counts.set(matched, count + 1)
		}

		for (const idx of out.keys()) {
			const text = out[idx]
			if (typeof text === 'string') {
				out[idx] = [fns.content(text)]
			}
		}

		return out.flat().join('')
	}
}

function _getStemData(localeUtils: LocaleUtils, nonStopWords: Set<string>) {
	return (text: string) => {
		const { locale } = localeUtils
		const segments = [...new Intl.Segmenter(String(locale), { granularity: 'word' }).segment(text)]

		const nonStopWordStems = new Set([...nonStopWords].map((x) => toNormalizedStem(x, localeUtils)))

		const stopWords = (highFreqWords[new Intl.Locale(locale).language]?.words ?? [])
			.map((x) => toNormalizedStem(x, localeUtils))
			.filter((x) => !nonStopWordStems.has(x))

		const all = segments.map((x) => {
			const { /* index, */ segment, isWordLike } = x

			if (!isWordLike) return { segment, stem: null }

			const normalized = toNormalizedStem(segment, localeUtils)

			const stem = stopWords.includes(normalized) ? null : normalized

			return {
				segment,
				stem,
			}
		})

		return { text, stems: all.filter(Boolean) }
	}
}

function toNormalizedStem(word: string, { locale, stemmer }: LocaleUtils) {
	return normalizeSubtle(stemmer.stemWord(word), locale)
}

/** normalize without stemming */
function normalizeSubtle(text: string, locale: Intl.Locale) {
	return text.replaceAll(/[^\p{L}\p{M}\p{N}]+/gu, ' ').trim().toLocaleLowerCase(String(locale)).normalize('NFKD')
		.replaceAll(/\p{M}+/gu, '')
}