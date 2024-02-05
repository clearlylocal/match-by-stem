import { type Stemmer } from './deps.ts'

export type Granularity = Exclude<ConstructorParameters<typeof Intl.Segmenter>[1], undefined>['granularity']
export type LocaleUtils = {
	locale: Intl.Locale
	stemmer: Stemmer
	segment: (text: string, granularity?: Granularity) => Intl.Segments
}

export type MatchByStemParams = {
	keywords: string[]
	localeUtils: LocaleUtils
}
export type MatchByStemAsyncParams = Expand<{ locale: Intl.Locale } & Omit<MatchByStemParams, 'localeUtils'>>
export type WrapByStemParams = Expand<{ transforms: Transforms } & MatchByStemParams>
export type WrapByStemAsyncParams = Expand<{ transforms: Transforms } & MatchByStemAsyncParams>

// https://stackoverflow.com/questions/57683303/how-can-i-see-the-full-expanded-contract-of-a-typescript-type
export type Expand<T> = T extends infer O ? { [K in keyof O]: O[K] } : never

export type PartialMatch = {
	start: number
	stems: {
		segment: string
		stem: string | null
	}[]
	text: string
}

export type _MatchInfo = { start: number; end: number; exact: string; matched: string }

/**
 * @property start - the start index
 * @property end - the end index
 * @property exact - the exact text that matched
 * @property matched - the source text that was matched against
 * @property count - the count of previous instances
 */
export type MatchInfo = Expand<_MatchInfo & { count: number }>

export type Transform = (matchInfo: MatchInfo) => string

export type Transforms = {
	content?: (text: string) => string
	startTag: string | Transform
	endTag: string | Transform
}

type FencePostMatchToken = {
	kind: 'start' | 'end'
	start: number
	end: number
	exact: string
	matched: string
	count: number
}

type ContentMatchToken = {
	kind: 'content'
	text: string
}

export type MatchToken = FencePostMatchToken | ContentMatchToken
