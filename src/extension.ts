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

		// Copiar el texto transformado al portapapeles (sin tocar el editor)
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
	const anotacionesIgnoradas = ['@Column', '@JoinColumn', '@JoinTable', '@ManyToMany', '@ManyToOne', '@OneToMany', '@MlCs',
		'@OneToOne', '@Embedded', '@EmbeddedId', '@MapsId', '@Id', '@GeneratedValue', '@Enumerated', '@Lob', '@Transient', '@Version'
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

		const fieldMatch = line.match(/private\s+([\w<>]+)\s+(\w+)(?=\s|=|;|$)/);

		if (fieldMatch) {
			const tipoJava = fieldMatch[1];
			const nombreCampo = fieldMatch[2];

			let tipoTS = '';
			let decorador = '';

			const options = decorators.length ? `{ ${decorators.join(', ')} }` : '';

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

			// Reset
			decorators = [];
		}


	}

	if (incluirId) {
		resultado = `@Id('number')\nid = null;\n\n` + resultado.trim();
	}

	return resultado.trim();
}
