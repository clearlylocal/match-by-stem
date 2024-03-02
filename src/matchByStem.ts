import { getStemmerByLocale, type Stemmer, unreachable } from './deps.ts'
import { highFreqWords } from './highFreqWords.ts'
import type {
	_MatchInfo,
	Granularity,
	LocaleUtils,
	MatchByStemAsyncParams,
	MatchByStemParams,
	MatcherOptions,
	PartialMatch,
	WrapByStemAsyncParams,
	WrapByStemParams,
	WrapperOptions,
} from './types.ts'
import { wrapTransforms } from './_wrapTransforms.ts'
import { MatchToken } from './types.ts'

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

export async function createWrapperAsync({ locale, ...params }: WrapByStemAsyncParams) {
	return createWrapper({ ...params, localeUtils: await getLocaleUtils(locale) })
}

export async function createMatcherAsync({ locale, ...params }: MatchByStemAsyncParams) {
	return createMatcher({ ...params, localeUtils: await getLocaleUtils(locale) })
}

export function createWrapper({ keywords, localeUtils, transforms }: WrapByStemParams) {
	const fns = wrapTransforms(transforms)

	const matcher = createMatcher({ keywords, localeUtils })

	return (text: string, options: Partial<WrapperOptions> = {}) =>
		matcher(text, options)
			.map((x) => {
				switch (x.kind) {
					case 'content': {
						return fns.content(x.text)
					}
					case 'start':
					case 'end': {
						return fns[`${x.kind}Tag`](x)
					}
					default: {
						unreachable()
					}
				}
			})
			.join('')
}

export function createMatcher({ keywords, localeUtils }: MatchByStemParams) {
	const { locale } = localeUtils

	const nonStopWords = new Set(keywords.flatMap((x) => {
		const wordSegs = [...localeUtils.segment(x, 'word')]
		return [
			wordSegs.find((x) => x.isWordLike)?.segment,
			wordSegs.findLast((x) => x.isWordLike)?.segment,
		].filter(Boolean) as string[]
	}))

	const getStemData = _getStemData(localeUtils, nonStopWords)

	const kwdStemData = keywords.map(getStemData)

	return (text: string, { counts: statefulCounts }: Partial<MatcherOptions> = {}) => {
		const inputTextStems = getStemData(text /* .replaceAll(/\n{3,}/g, '\n\n') */).stems

		const tokens: (string | MatchToken[])[] = []
		const partialMatches: PartialMatch[] = []
		const matches: _MatchInfo[] = []

		outerLoop: for (const [inputIdx, { segment, stem }] of inputTextStems.entries()) {
			tokens.push(segment)

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

		const counts = statefulCounts ?? new Map<string, number>()

		const sorters: ((x: _MatchInfo) => number)[] = [
			// already-matched gets lowest priority
			(x) => (counts.get(x.matched) ?? 0),
			// longer matches get higher priority
			(x) => -[...x.matched].length,
			// exact-ish matches get higher priority
			(x) => -Number(normalizeSubtle(x.exact, locale) === normalizeSubtle(x.matched, locale)),
			// earlier matches get higher priority
			(x) => x.start,
		]

		const sortReverse = (a: _MatchInfo, b: _MatchInfo) =>
			sorters.reduce((acc, sorter) => acc || sorter(b) - sorter(a), 0)

		const touchedTokenIndexes = tokens.map(() => false)

		while (matches.length) {
			// sort reversed in-place and `pop` from end (better perf than `shift`)
			matches.sort(sortReverse)
			const m = matches.pop()!
			const { start, end, matched } = m

			if (touchedTokenIndexes.slice(start, end + 1).some(Boolean)) {
				// overlaps existing
				continue
			}
			for (let i = start; i <= end; ++i) {
				touchedTokenIndexes[i] = true
			}

			const count = counts.get(matched) ?? 0

			const s = tokens[start] as string
			const e = tokens[end] as string

			if (start === end) {
				tokens[start] = [{ kind: 'start', ...m, count }, { kind: 'content', text: s }, {
					kind: 'end',
					...m,
					count,
				}]
			} else {
				tokens[start] = [{ kind: 'start', ...m, count }, { kind: 'content', text: s }]
				tokens[end] = [{ kind: 'content', text: e }, { kind: 'end', ...m, count }]
			}

			counts.set(matched, count + 1)
		}

		for (const [idx, text] of tokens.entries()) {
			if (typeof text === 'string') {
				tokens[idx] = [{ kind: 'content', text }]
			}
		}

		return tokens.flat().map((x) => typeof x === 'string' ? { kind: 'content' as const, text: x } : x)
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
