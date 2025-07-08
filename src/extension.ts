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
	const lines = javaCode.split('\n');

	let resultado = '';
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
				decorators.push(`{ min: 0, digits: { digitos: ${integer}, decimales: ${fraction} } }`);
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


	for (let i = 0; i < lines.length; i++) {
		let line = lines[i].trim();

		if (anotacionesIgnoradas.some(anotacion => line.startsWith(anotacion))) {
			continue;
		}

		if (line.startsWith('/**') || line.startsWith('/*')) {
			dentroDeComentarioBloque = true;
		}

		if (dentroDeComentarioBloque) {
			if (line.includes('*/')) {
				dentroDeComentarioBloque = false;
			}
			continue;
		}

		if (line.startsWith('//') || line.startsWith('*')) {
			continue;
		}

		line = line.split('//')[0].trim();

		let procesada = false;
		for (const { regex, procesar } of anotacionesProcesar) {
			const match = line.match(regex);
			if (match) {
				procesar(match);
				procesada = true;
				break;
			}
		}
		if (procesada) {
			continue;
		}

		const coincidencia = line.match(/private\s+([\w<>]+)\s+(\w+)(?=\s|=|;|$)/);

		if (coincidencia) {
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
				const options = decorators.length ? decorators[0] : '';
				decorador = `@Numero(${options})`;
			} else if (esJson && tipoJava === 'String') {
				tipoTS = 'JSON | null';
				const opciones = [...decorators, ...jsonOpts];
				decorador = `@JsonObject({ ${opciones.join(', ')} })`;
			} else if (tipoJava === 'String') {
				tipoTS = 'string | null';
				const options = decorators.length ? `{ ${decorators.join(', ')} }` : '';
				decorador = `@Texto(${options})`;
			} else if (['LocalDate', 'LocalDateTime'].includes(tipoJava)) {
				tipoTS = 'Date | null';
				const options = decorators.length ? `{ ${decorators.join(', ')} }` : '';
				decorador = `@Fecha(${options})`;
			} else if ((tipoJava === 'Boolean')) {
				tipoTS = 'boolean | null';
				const options = decorators.length ? `{ ${decorators.join(', ')} }` : '';
				decorador = `@Booleano(${options})`;
			} else {
				tipoTS = `${tipoJava} | null`;
				const options = decorators.length ? `{ ${decorators.join(', ')} }` : '';
				decorador = `@ObjectId(${options})`;
			}

			// Limpiar paréntesis vacíos
			if (decorador.endsWith('({  })') || decorador.endsWith('({})')) {
				decorador = decorador.split('(')[0] + '()';
			}

			resultado += `${decorador}\n${nombreCampo}: ${tipoTS} = null;\n\n`;

			decorators = [];
			jsonOpts = [];
			esJson = false;
		}
	}

	if (incluirId) {
		resultado = `@Id('number')\nid = null;\n\n` + resultado.trim();
	}

	return resultado.trim();
}
