# TopNote

Aplicativo de notas locais para Windows 10 e 11. A cápsula fica no topo da tela; o editor rápido abre com `Ctrl + Shift + Space` e salva automaticamente. O Workspace organiza notas em projetos e pastas.

## Instalação

Baixe e execute o [instalador do TopNote para Windows 64 bits](releases/TopNote_0.1.2_x64-setup.exe). Ele funciona no Windows 10 e 11 e instala o WebView2 se o sistema ainda não o tiver; essa etapa pode exigir conexão com a internet. Depois, abra **TopNote** pelo menu Iniciar. Na primeira execução, conclua as três telas iniciais.

O instalador não tem assinatura de código. O Windows pode mostrar um aviso do SmartScreen; confira a origem do arquivo antes de executá-lo. Para compartilhar, envie o instalador da pasta `releases/` ou o link acima.

SHA-256 do instalador 0.1.2: `B6BDA9E816F7EE87EF496720FAC4BA6CE7E2A18B5FBE3346E61ED4FF4AFE45B6`.

## Uso rápido

1. Pressione `Ctrl + Shift + Space` ou clique na cápsula.
2. Escreva o título e o conteúdo. O indicador no rodapé confirma quando a nota foi salva.
3. Clique em **Inbox** (ou no nome do projeto atual) para abrir o seletor à esquerda. Expanda Inbox ou um projeto para ver suas notas e clique na nota que deseja abrir. O botão **+** ao lado do projeto cria outra nota nele.
4. Clique novamente na cápsula ou pressione `Esc` para recolher o editor.
5. Abra o Workspace pelo menu **Mais ações** no rodapé. Use **Recolher** na barra superior para voltar à cápsula.

A cápsula fica quase invisível em repouso e aparece ao passar o mouse. Toda a cápsula responde ao clique; segure o botão esquerdo e arraste para movê-la. O editor e o Workspace podem ser movidos pelo cabeçalho e redimensionados pelos cantos e bordas. O tamanho escolhido é lembrado.

O editor, a cápsula, o seletor de projetos e os formulários são janelas independentes. Os formulários mantêm os botões visíveis ao reduzir a altura e permitem rolar os campos. Ao criar ou editar um projeto, escolha uma cor e um dos ícones disponíveis. Para editar pelo seletor, use o botão direito no projeto.

Para copiar um arquivo anexado para outra pasta, arraste a linha do anexo pelo nome até o Explorer. O arquivo continua anexado à nota. Os cartões mostram o tipo de arquivo, como TXT, PDF ou DOC.

Em **Configurações → Geral**, ative ou desative **Iniciar com o Windows**. A opção **Mostrar cápsula ao iniciar** define se a cápsula aparece após a abertura automática; desativada, o aplicativo fica na bandeja do sistema.

O efeito de vidro usa transparência ajustável em tempo real em **Configurações → Aparência**, inclusive no Workspace. O controle **Desfoque do Windows** liga ou desliga o acrílico nativo; a intensidade do desfoque é definida pelo Windows. O desfoque aparece quando **Efeitos de transparência** está ativado em **Configurações do Windows → Personalização → Cores**. Com o efeito desligado, o TopNote mantém a transparência sem desfoque. Uma única borda acompanha os cantos arredondados, sem barra de título nativa sobre a interface.

## Atalhos

| Atalho | Ação |
| --- | --- |
| `Ctrl + Shift + Space` | Abrir ou recolher o editor rápido; pode ser alterado nas configurações |
| `Ctrl + K` | Pesquisa e comandos |
| `Ctrl + N` | Nova nota |
| `Ctrl + Shift + N` | Novo projeto |
| `Ctrl + P` | Trocar de projeto |
| `Ctrl + Enter` | Salvar imediatamente |
| `Esc` | Recolher o editor rápido |

## Desenvolvimento

Requer Node.js, npm, Rust via rustup e Visual Studio Build Tools com o compilador C++ e o Windows SDK. No diretório do projeto:

```powershell
npm ci
npm run desktop:dev
```

Para validar:

```powershell
npm run build
npm test -- --configLoader runner
cd src-tauri
cargo test --locked
```

## Build

```powershell
npm run desktop:build
```

O executável é gerado em `src-tauri/target/release/topnote.exe` e o instalador NSIS em `src-tauri/target/release/bundle/nsis/`. A cópia pronta para compartilhar fica em `releases/`.

## Estrutura do projeto

| Caminho | Conteúdo |
| --- | --- |
| `src/components` | Cápsula, editor, Workspace, pesquisa, anexos e configurações |
| `src/services` | Chamadas nativas, autosave e exportação |
| `src-tauri/src` | Janela e tray nativas, repositório SQLite, anexos e backup |
| `src-tauri/migrations` | Esquema e índice de pesquisa FTS5 |

## Armazenamento dos dados

Os dados ficam em `%LOCALAPPDATA%\com.topnote.desktop\`:

```text
topnote.db
attachments\
backups\
topnote.log
```

O banco e os anexos são locais. Nenhuma conta ou conexão com a nuvem é necessária. O editor salva em segundo plano e esvazia alterações pendentes ao recolher ou fechar a janela.

## Backup

Em **Configurações → Dados**, use **Criar backup** para gerar um arquivo ZIP com o banco e os anexos. **Restaurar** substitui os dados atuais pelo conteúdo de um backup após confirmação. O backup automático pode ser configurado para execução diária ou semanal, com limite de 5, 10 ou 20 arquivos.

## Licença

MIT. Consulte [LICENSE](LICENSE).

## Versão

0.1.2
