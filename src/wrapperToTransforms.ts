import type { Transform, Transforms } from './types.ts'

export function wrappersToTransforms(
	wrapper: (text: string) => string,
	wrapper2?: (text: string) => string,
): Transforms {
	const [s1, e1] = wrapper('\0').split('\0')
	const [s2, e2] = wrapper2 ? wrapper2('\0').split('\0') : [s1, e1]

	const startTag: Transform = ({ count }) => count ? s2 : s1
	const endTag: Transform = ({ count }) => count ? e2 : e1

	return { startTag, endTag }
}
