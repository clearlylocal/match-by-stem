import wordFreq from './data/wordFreq.json' assert { type: 'json' }

const CUTOFF = 6.5

const datas = Object.entries(wordFreq)
	.sort(([k]) => ['zh', 'en', 'es', 'fr'].includes(k) ? -1 : 1)
	.map(([locale, words]) => [locale, words] as const)
	.map(([locale, { words, freqs }]) => {
		return {
			locale,
			localeName: new Intl.DisplayNames('en-US', { type: 'language' }).of(locale)!,
			words,
			freqs,
		}
	})

export const highFreqWords = Object.fromEntries(datas
	.map(({ locale, localeName, words, freqs }) => {
		const w = words.slice(0, freqs.findIndex((x) => x < CUTOFF))

		return [locale, { locale, localeName, words: w }]
	}))
