import type { Transforms } from './types.ts'

export function wrapTransform<T>(arg: string | ((arg: T) => string)) {
	return typeof arg === 'string' ? () => arg : arg
}

export function wrapTransforms(transforms: Transforms) {
	return {
		startTag: wrapTransform(transforms.startTag ?? ''),
		endTag: wrapTransform(transforms.endTag ?? ''),
		content: wrapTransform(transforms.content ?? ((text: string) => text)),
	}
}
