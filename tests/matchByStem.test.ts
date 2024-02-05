import { assertEquals, assertStringIncludes, bgCyan, cyan } from '../src/devDeps.ts'
import { htmlTransforms } from '../src/htmlTransforms.ts'
import { createWrapperAsync } from '../src/matchByStem.ts'
import type { Transform, Transforms } from '../src/types.ts'

function wrappersToTransforms(
	wrapper: (text: string) => string,
	wrapper2?: (text: string) => string,
): Transforms {
	const [s1, e1] = wrapper('\0').split('\0')
	const [s2, e2] = wrapper2 ? wrapper2('\0').split('\0') : [s1, e1]

	const startTag: Transform = ({ count }) => count ? s2 : s1
	const endTag: Transform = ({ count }) => count ? e2 : e1

	return { startTag, endTag }
}

Deno.test(createWrapperAsync.name, async (t) => {
	const transforms = wrappersToTransforms((x) => `[${x}]`)

	await t.step('breaks', async (t) => {
		const locale = new Intl.Locale('en-US')

		await t.step('should not break', async (t) => {
			const seps = {
				'hyphen': '-',
				'em-dash': '—',
				'ampersand': '&',
				'hyphen with spaces': ' - ',
				'em-dash with spaces': ' — ',
				'ampersand with spaces': ' & ',
			}

			for (const [name, literal] of Object.entries(seps)) {
				const keywords = ['one two three']
				const match = await createWrapperAsync({ keywords, locale, transforms })

				await t.step(`should not break on ${name}`, () => {
					const text = `one${literal}two three`

					const out = match(text)
					assertEquals(out, `[${text}]`)
				})
			}
		})

		await t.step('should break', async (t) => {
			const seps = {
				newline: '\n',
				period: '. ',
				comma: ', ',
				colon: ': ',
				semicolon: '; ',
			}

			for (const [name, literal] of Object.entries(seps)) {
				const keywords = ['one two three']
				const match = await createWrapperAsync({ keywords, locale, transforms })

				await t.step(`should break on ${name}`, () => {
					const text = `one${literal}two three`

					const out = match(text)
					assertEquals(out, text /* unchanged */)
				})
			}
		})
	})

	await t.step('ordering of results', async (t) => {
		const locale = new Intl.Locale('en-US')
		const transforms = wrappersToTransforms((x) => `[[${x}]]`, (x) => `{${x}}`)

		await t.step('word order', async () => {
			const keywords = ['one two three']
			const text = `three two one\ntwo three one\nOne two Three`

			const match = await createWrapperAsync({ keywords, locale, transforms })
			const out = match(text)
			assertEquals(out, `{three two one}\n{two three one}\n[[One two Three]]`)
		})
	})

	await t.step('bug reports', async (t) => {
		const startTag = '['
		const endTag = ']'
		const transforms = { startTag, endTag }
		const locale = new Intl.Locale('en-US')

		await t.step(
			'plastic c channel - short word "c" that matches against start of another word "channel" (Sifat, 2023-12-04)',
			async () => {
				const keywords = [
					'plastic c channel',
					'pvc c channel',
					'clear plastic c channel',
				]
				const text =
					`The plastic c channel is a versatile product composed of a range of materials, most commonly polyvinyl chloride, or PVC. This gives rise to the term PVC C channel, a term that signifies a c channel that is thicker and more durable due to its PVC composition. However, the clear plastic c channel isn't limited to PVC. There are other variations made from galvanized steel or other steel types. These versions have varying thicknesses, typically sized to accommodate cables ranging from 240V to 440V.`

				const match = await createWrapperAsync({ keywords, locale, transforms })
				const out = match(text)
				assertEquals(
					out,
					`The [plastic c channel] is a versatile product composed of a range of materials, most commonly polyvinyl chloride, or PVC. This gives rise to the term [PVC C channel], a term that signifies a c channel that is thicker and more durable due to its PVC composition. However, the [clear plastic c channel] isn't limited to PVC. There are other variations made from galvanized steel or other steel types. These versions have varying thicknesses, typically sized to accommodate cables ranging from 240V to 440V.`,
				)
			},
		)

		await t.step('hair color wax (Sifat, 2023-12-31)', async () => {
			const keywords = ['hair color wax for black hair', 'hair color wax for natural hair']
			const text = `For instance, hair color wax for black hair or hair color wax for natural hair`

			const match = await createWrapperAsync({ keywords, locale, transforms })
			const out = match(text)
			assertEquals(out, `For instance, [hair color wax for black hair] or [hair color wax for natural hair]`)
		})

		await t.step('A Frame - starts/ends with apparent stop word "A" (Sifat, 2023-12-05)', async (t) => {
			await t.step('starts with stop-word-like', async () => {
				const keywords = ['A Frame']
				const text = `This is an A Frame`

				const match = await createWrapperAsync({ keywords, locale, transforms })
				const out = match(text)
				assertEquals(out, `This is an [A Frame]`)
			})
			await t.step('ends with stop-word-like', async () => {
				const keywords = ['Frame A']
				const text = `This is Frame A`

				const match = await createWrapperAsync({ keywords, locale, transforms })
				const out = match(text)
				assertEquals(out, `This is [Frame A]`)
			})
		})
	})

	await t.step('individual keyword length', async (t) => {
		await t.step('single-word keyword', async () => {
			const locale = new Intl.Locale('en-US')
			const keywords = ['hello', 'world']
			const text = `Hello, world!`

			const match = await createWrapperAsync({ keywords, locale, transforms })
			const out = match(text)
			assertEquals(out, `[Hello], [world]!`)
		})

		await t.step('multi-word keyword', async () => {
			const locale = new Intl.Locale('en-US')
			const keywords = ['hello world']
			const text = `Hello world!`

			const match = await createWrapperAsync({ keywords, locale, transforms })
			const out = match(text)
			assertEquals(out, `[Hello world]!`)
		})
	})

	await t.step('locales', async (t) => {
		await t.step('en-US (basic)', async () => {
			const locale = new Intl.Locale('en-US')
			const keywords = ['hello world', 'English words']
			const text = `abc hello worlds english word`

			const match = await createWrapperAsync({ keywords, locale, transforms })
			const out = match(text)
			assertEquals(out, `abc [hello worlds] [english word]`)
		})

		await t.step('es-MX (diacritics)', async () => {
			const locale = new Intl.Locale('es-MX')
			const keywords = ['el nino']
			const text = `el niño`

			const match = await createWrapperAsync({ keywords, locale, transforms })
			const out = match(text)
			assertEquals(out, `[el niño]`)
		})

		await t.step('ru-RU (complex inflections)', async () => {
			const locale = new Intl.Locale('ru-RU')
			const keywords = ['собака']
			const text = `собака собаки собак`

			const match = await createWrapperAsync({ keywords, locale, transforms })
			const out = match(text)
			assertEquals(out, `[собака] [собаки] [собак]`)
		})

		await t.step('zh-CN (non-spaced)', async () => {
			const transforms = wrappersToTransforms((x) => `【${x}】`)
			const locale = new Intl.Locale('zh-CN')
			const keywords = ['中华', '共和国']
			const text = `中华人民共和国`

			const match = await createWrapperAsync({ keywords, locale, transforms })
			const out = match(text)
			assertEquals(out, `【中华】人民【共和国】`)
		})

		await t.step('th-TH (non-spaced)', async () => {
			const transforms = wrappersToTransforms((x) => `【${x}】`)
			const locale = new Intl.Locale('th-TH')
			const keywords = ['ภาษา']
			const text = `Snowball เป็นภาษาประมวลผลสตริงขนาดเล็กสำหรับการสร้างอัลกอริธึมการกั้น`

			const match = await createWrapperAsync({ keywords, locale, transforms })
			const out = match(text)
			assertEquals(out, `Snowball เป็น【ภาษา】ประมวลผลสตริงขนาดเล็กสำหรับการสร้างอัลกอริธึมการกั้น`)
		})

		await t.step('xx-XX (unrecognized locale)', async () => {
			const locale = new Intl.Locale('xx-XX')
			const keywords = ['lorem ipsum', 'consectetur adipiscing']
			const text =
				`Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.`

			const match = await createWrapperAsync({ keywords, locale, transforms })
			const out = match(text)
			assertEquals(
				out,
				`[Lorem ipsum] dolor sit amet, [consectetur adipiscing] elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.`,
			)
		})
	})

	await t.step('Spanish Wikipedia', async (t) => {
		const locale = new Intl.Locale('es-MX')
		const keywords = ['un punto de vista "más" amplio', 'desde el punto de vista']

		const text =
			`Desde el punto de vista más amplio, la comunicación indica una característica común a los humanos y a otros animales (animales no simbólicos) para expresar experiencias mediante el uso de señales y sonidos registrados por los órganos de los sentidos. Los seres humanos desarrollan un lenguaje simbólico complejo que se expresa con secuencias sonoras y signos gráficos. Por su parte, los animales se comunican a través de signos sonoros, olfativos y corporales que en muchos casos distan de ser sencillos. 

Desde un punto de vista más amplio, la comunicación indica una característica común a los humanos y a otros animales (animales no simbólicos) para expresar experiencias mediante el uso de señales y sonidos registrados por los órganos de los sentidos. Los seres humanos desarrollan un lenguaje simbólico complejo que se expresa con secuencias sonoras y signos gráficos. Por su parte, los animales se comunican a través de signos sonoros, olfativos y corporales que en muchos casos distan de ser sencillos.

El lenguaje humano se apoya en la capacidad de comunicarse por medio de signos lingüísticos (usualmente secuencias sonoras y signos gráficos, pero también con gestos en el caso de las lenguas de señas). En cuanto a su desarrollo, el lenguaje humano puede estudiarse desde una vista de los puntos complementarios: la ontogenia y la filogenia. La primera analiza el proceso por el cual el ser humano adquiere el lenguaje, mientras que la segunda se encarga de estudiar la evolución histórica de una lengua. La antropología del lenguaje hace del lenguaje una pieza clave en su interpretación del ser humano, si bien esto no es extremadamente novedoso, remite a antiguas y variadas tradiciones culturales desde tiempos muy lejanos en la historia de occidente.`

		await t.step('plain', async () => {
			const startTag = '['
			const endTag = ']'
			const transforms = { startTag, endTag }

			const match = await createWrapperAsync({ keywords, locale, transforms })
			const out = match(text)
			assertStringIncludes(out, '[Desde el punto de vista]')
			assertStringIncludes(out, '[un punto de vista más amplio]')
			assertStringIncludes(out, '[desde una vista de los puntos]')
		})

		await t.step('html', async () => {
			const transforms = htmlTransforms(
				({ count }) => count ? 'span' : 'strong',
				({ matched }) => ({
					title: matched,
					class: 'hl',
				}),
			)

			const match = await createWrapperAsync({ keywords, locale, transforms })
			const out = match(text)
			assertStringIncludes(
				out,
				'<strong title="desde el punto de vista" class="hl">Desde el punto de vista</strong>',
			)
			assertStringIncludes(
				out,
				'<strong title="un punto de vista &quot;más&quot; amplio" class="hl">un punto de vista más amplio</strong>',
			)
			assertStringIncludes(
				out,
				'<span title="desde el punto de vista" class="hl">desde una vista de los puntos</span>',
			)
		})

		await t.step('color', async () => {
			const transforms = wrappersToTransforms(bgCyan, cyan)

			const match = await createWrapperAsync({ keywords, locale, transforms })
			const out = match(text)

			try {
				assertStringIncludes(out, bgCyan('Desde el punto de vista'))
				assertStringIncludes(out, bgCyan('un punto de vista más amplio'))
				assertStringIncludes(out, cyan('desde una vista de los puntos'))
			} catch (e) {
				console.info(out)
				throw e
			}
		})
	})
})
