import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
	let disposable = vscode.commands.registerCommand('jata-to-angular-setting-class.convert', async () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showErrorMessage('No hay editor activo');
			return;
		}

		const selection = editor.selection;
		const selectedText = editor.document.getText(selection);
		if (!selectedText) {
			vscode.window.showWarningMessage('Selecciona código Java primero');
			return;
		}

		// Convertir el texto seleccionado
		const converted = convertirJavaAAngular(selectedText);

		// Copiar el texto transformado al portapapeles
		await vscode.env.clipboard.writeText(converted);

		vscode.window.showInformationMessage('Código copiado al portapapeles.');
	});

	context.subscriptions.push(disposable);
}

function convertirJavaAAngular(javaCode: string): string {
	const lineas = javaCode.split('\n');

	const resultadoLineas: string[] = [];
	let decorators: string[] = [];
	let incluirId = false;
	let dentroDeComentarioBloque = false;
	let esJson = false;
	let jsonOpts: string[] = [];
	const anotacionesIgnoradas = ['@Column', '@JoinColumn', '@JoinTable', '@ManyToMany', '@ManyToOne', '@OneToMany', '@EmailCs',
		'@OneToOne', '@Embedded', '@EmbeddedId', '@MapsId', '@Id', '@GeneratedValue', '@Enumerated', '@Transient', '@Version',
		'@TelefonoCs', '@Convert', '@ArchivoId', '@Min', '@Max'
	];

	const anotacionesProcesar = [
		{
			regex: /^private\s+static\s+final\s+long\s+serialVersionUID/,
			procesar: () => { incluirId = true; }
		},
		{
			regex: /^@NotNull/,
			procesar: () => { decorators.push('required: true'); }
		},
		{
			regex: /@Size\(max\s*=\s*(\d+)\)/,
			procesar: (match: RegExpMatchArray) => {
				decorators.push(`maxLength: ${match[1]}`);
			}
		},
		{
			regex: /@Digits\s*\(\s*integer\s*=\s*(\d+),\s*fraction\s*=\s*(\d+)\s*\)/,
			procesar: (match: RegExpMatchArray) => {
				const integer = match[1];
				const fraction = match[2];
				decorators.push(`{ min: 0, digits: { digitos: ${integer}, decimales: ${fraction} }}`);
			}
		},
		{
			regex: /@MlCs\s*\(\s*min\s*=\s*(\d+)\s*,\s*max\s*=\s*(\d+)\s*\)/,
			procesar: (match: RegExpMatchArray) => {
				esJson = true;
				jsonOpts.push(`minFieldLength: ${match[1]}`);
				jsonOpts.push(`maxFieldLength: ${match[2]}`);
			}
		},
		{
			regex: /^@Lob/,
			procesar: () => {
				esJson = true;
			}
		}
	];


	for (let linea of lineas) {
		linea = linea.trim();

		// Ignorar anotaciones que no queremos procesar
		if (anotacionesIgnoradas.some(a => linea.startsWith(a))) continue;

		// Ignorar codigo comentado
		if (linea.startsWith('/**') || linea.startsWith('/*')) dentroDeComentarioBloque = true;

		if (dentroDeComentarioBloque) {
			if (linea.includes('*/')) dentroDeComentarioBloque = false;
			continue;
		}

		if (linea.startsWith('//') || linea.startsWith('*')) continue;

		// Quitar comentarios al final de línea
		linea = linea.split('//')[0].trim();

		// Procesar anotaciones específicas que llenan decorators, jsonOpts o flags
		let procesada = false;
		for (const { regex, procesar } of anotacionesProcesar) {
			const match = linea.match(regex);
			if (match) {
				procesar(match);
				procesada = true;
				break;
			}
		}
		if (procesada) continue;

		const coincidencia = linea.match(/private\s+([\w<>]+)\s+(\w+)(?=\s|=|;|$)/);

		if (!coincidencia) continue;

		const tipoJava = coincidencia[1];
		const nombreCampo = coincidencia[2];

		let tipoTS = '';
		let decorador = '';

		if (tipoJava.startsWith('List<')) {
			const entidad = tipoJava.match(/<(\w+)>/)?.[1] || 'Unknown';
			tipoTS = `${entidad}[] | null`;
			decorador = `@ArrayEntity({ entity: ${entidad} })`;
		} else if (tipoJava.startsWith('Set<')) {
			const entidad = tipoJava.match(/<(\w+)>/)?.[1] || 'Unknown';
			tipoTS = `${entidad}[] | null`;
			decorador = `@ArrayObjectId({ mapToEntity: ${entidad} })`;
		} else if (['Double', 'Integer', 'Long'].includes(tipoJava)) {
			tipoTS = 'number | null';
			decorador = construirDecorador('@Numero', decorators);
		} else if (esJson && tipoJava === 'String') {
			tipoTS = 'JSON | null';
			decorador = construirDecorador('@JsonObject', [...decorators, ...jsonOpts]);
		} else if (tipoJava === 'String') {
			tipoTS = 'string | null';
			decorador = construirDecorador('@Texto', decorators);
		} else if (['LocalDate', 'LocalDateTime'].includes(tipoJava)) {
			tipoTS = 'Date | null';
			decorador = construirDecorador('@Fecha', decorators);
		} else if ((tipoJava === 'Boolean')) {
			tipoTS = 'boolean | null';
			decorador = construirDecorador('@Booleano', decorators);
		} else {
			tipoTS = `${tipoJava} | null`;
			decorador = construirDecorador('@ObjectId', decorators);
		}
		resultadoLineas.push(`${decorador}\n${nombreCampo}: ${tipoTS} = null;\n`);

		// Reiniciar estado para el siguiente campo
		decorators = [];
		jsonOpts = [];
		esJson = false;

	}

	if (incluirId) {
		resultadoLineas.unshift(`@Id('number')\nid = null;\n\n`);
	}

	return resultadoLineas.join('').trim();
}

function construirDecorador(nombre: string, opciones: string[]): string {
	const limpias = opciones.filter(opt => opt?.trim());
	const opts = limpias.length ? `{ ${limpias.join(', ')} }` : '';
	const decorador = `${nombre}(${opts})`;
	return decorador.endsWith('({})') ? `${nombre}()` : decorador;
}
