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

		console.log('Selected text:', selectedText);

		const converted = convertirJavaAAngular(selectedText);

		// Copiar el texto transformado al portapapeles (sin tocar el editor)
		await vscode.env.clipboard.writeText(converted);

		vscode.window.showInformationMessage('Código transformado copiado al portapapeles. Pega donde quieras.');
	});

	context.subscriptions.push(disposable);
}

function convertirJavaAAngular(javaCode: string): string {
	const lines = javaCode.split('\n');

	let resultado = '';
	let decorators: string[] = [];
	let incluirId = false;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i].trim();

		// Detectar si se incluye la línea del serialVersionUID (dentro del texto seleccionado)
		if (/private\s+static\s+final\s+long\s+serialVersionUID/.test(line)) {
			incluirId = true;
			continue;
		}

		if (line.startsWith('@NotNull')) {
			decorators.push('required: true');
			continue;
		}

		const sizeMatch = line.match(/@Size\(max\s*=\s*(\d+)\)/);
		if (sizeMatch) {
			decorators.push(`maxLength: ${sizeMatch[1]}`);
			continue;
		}

		if (line.startsWith('@Column')) continue;
		if (line.startsWith('@JoinColumn')) continue;

		const isRelation = line.startsWith('@ManyToOne');

		const fieldMatch = line.match(/private\s+([\w<>]+)\s+(\w+);/);
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
			} else if (['Double', 'Integer', 'Long'].includes(tipoJava)) {
				tipoTS = 'number | null';
				decorador = `@Numero(${options || ''})`;
			} else if (tipoJava === 'String') {
				tipoTS = 'string | null';
				decorador = `@Texto(${options || ''})`;
			} else if (['LocalDate', 'LocalDateTime'].includes(tipoJava)) {
				tipoTS = 'Date | null';
				decorador = `@Fecha(${options || ''})`;
			} else {
				tipoTS = `${tipoJava} | null`;
				decorador = `@ObjectId(${options || ''})`;
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
