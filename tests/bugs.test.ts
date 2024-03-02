import { assert } from '../src/devDeps.ts'
import { htmlTransforms } from '../src/htmlTransforms.ts'
import { createMatcherAsync, createWrapperAsync } from '../src/matchByStem.ts'
// import type { Transform, Transforms } from '../src/types.ts'

Deno.test('bugs', async (t) => {
	await t.step('double-wrapped elements', async () => {
		const transforms = htmlTransforms(
			() => 'b',
			({ count }) => {
				return {
					count: count ? String(count + 1) : undefined,
				}
			},
		)

		const text =
			`The cost of stump grinding can vary depending on the type of grinder you choose. For example, a small stump grinder might be more affordable than a commercial stump grinder. However, Alibaba.com offers competitive prices on all types of stump grinders, including the vermeer stump grinder, dr stump grinder, and rayco stump grinder. Whether you're looking for a stump grinder for sale near me or a used stump grinder for sale, you're sure to find a great deal on Alibaba.com.`

		const locale = new Intl.Locale('en-US')
		const keywords: string[] = JSON.parse(
			'["stump grinder","stump grinding near me","stump grinding service near me","tree stump grinding near me","stump grinder for sale","tree stump grinder","skid steer stump grinder","stump grinding cost","vermeer stump grinder","3 point hitch stump grinder","3 point stump grinder","home depot stump grinder","pto stump grinder","stump grinding service","toro stump grinder","bandit stump grinder","dr stump grinder","rayco stump grinder","small stump grinder","stump grinder for tractor","woodland mills stump grinder","barreto stump grinder","baumalight stump grinder","used stump grinder for sale","commercial stump grinder","carlton stump grinder","vermeer stump grinder for sale","bobcat stump grinder","dosko stump grinder","power king stump grinder","stump grinder for sale near me","best stump grinder","dk2 stump grinder","handheld stump grinder","root grinder","vermeer sc30tx","bandit sg 40","mini stump grinder","used stump grinder for sale near me","hand held stump grinder","portable stump grinder","stump cutter","vermeer sc252","fecon stumpex","toro stump grinder for sale","used stump grinder for sale craigslist","dr stump","stump grinder hire","tree stump grinder hire","stump grinder hire near me"]',
		)

		const wrap = await createWrapperAsync({ keywords, locale, transforms })
		const wrapped = wrap(text)

		const doubleWrappedElRe = /<[^/]+>[^/]*<[^/]+>[^/]*<[/][^/]+>[^/]*[/][^/]+>/g

		const matches = [...wrapped.matchAll(doubleWrappedElRe)].flat()

		const match = await createMatcherAsync({ keywords, locale })
		console.log(match(text).slice(75))

		assert(matches.length === 0, `Found double-wrapped elements: ${JSON.stringify(matches)}`)
	})
})
