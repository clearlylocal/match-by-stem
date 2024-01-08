import { escapeHtml } from './deps.ts'
import type { MatchInfo, Transform, Transforms } from './types.ts'
import { wrapTransform } from './_wrapTransforms.ts'

type Attributes = Record<string, string | null | undefined>

export function htmlTransforms(
	tagName: string | Transform,
	attributes?: Attributes | ((matchInfo: MatchInfo) => Attributes),
): Transforms {
	const tag = wrapTransform(tagName)

	const content = escapeHtml
	const startTag = (m: MatchInfo) => {
		const attrs = typeof attributes === 'function' ? attributes(m) : attributes == null ? {} : attributes

		return `<${escapeHtml(tag(m))}${
			Object.entries(attrs).map(([k, v]) => v == null ? null : ` ${escapeHtml(k)}="${escapeHtml(v)}"`).filter(
				Boolean,
			).join('')
		}>`
	}

	const endTag = (m: MatchInfo) => `</${escapeHtml(tag(m))}>`
	return { startTag, endTag, content }
}
