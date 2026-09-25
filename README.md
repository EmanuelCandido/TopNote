<p align="center">
  <img src="src/assets/topnote-icon.png" alt="Ícone do TopNote" width="104" />
</p>

<h1 align="center">TopNote</h1>

<p align="center">
  Capture uma ideia em segundos. Encontre, organize e continue quando quiser.
  <br />
  Um aplicativo de notas para Windows com acesso rápido e dados locais.
</p>

<p align="center">
  <img alt="Versão 0.1.3" src="https://img.shields.io/badge/vers%C3%A3o-0.1.3-4387e8" />
  <img alt="Windows 10 e 11" src="https://img.shields.io/badge/plataforma-Windows%2010%20%7C%2011-0078d4" />
  <img alt="Licença MIT" src="https://img.shields.io/badge/licen%C3%A7a-MIT-31a17f" />
  <img alt="React, Tauri e SQLite" src="https://img.shields.io/badge/React%20%2B%20Tauri%20%2B%20SQLite-local-333b4d" />
</p>

<p align="center">
  <a href="releases/TopNote_0.1.3_x64-setup.exe"><strong>Baixar instalador</strong></a>
  · <a href="#primeiros-passos">Primeiros passos</a>
  · <a href="#desenvolvimento">Desenvolvimento</a>
  · <a href="https://github.com/EmanuelCandido/TopNote/issues">Reportar problema</a>
</p>

https://github.com/user-attachments/assets/c121b991-9f03-42a8-97b4-158a195280ec

## Sobre o projeto

O **TopNote** aproxima a captura de ideias do trabalho que você já está fazendo. Um atalho global abre o editor compacto sobre a área de trabalho; o Workspace oferece espaço para revisar, pesquisar e organizar notas com mais calma. As alterações são salvas automaticamente em um banco SQLite no próprio computador.

O aplicativo foi pensado para quem quer registrar algo sem trocar de contexto: uma tarefa durante uma reunião, um trecho de texto para consultar depois ou um arquivo relacionado a um projeto. Não é preciso criar conta para começar.

## Funcionalidades

| Área | Recursos |
| --- | --- |
| **Captura** | Editor rápido pelo atalho `Ctrl + Shift + Space`, cápsula discreta na área de trabalho e salvamento automático. |
| **Organização** | Inbox, projetos com várias notas, pastas, favoritos, recentes, arquivo e lixeira. |
| **Edição** | Texto formatado, listas, checklists, links, imagens, blocos de código e histórico de versões da nota. |
| **Arquivos** | Anexos por seleção, colagem ou arraste. Abra o arquivo, localize-o no Explorer ou copie-o para outra pasta arrastando pelo nome. |
| **Busca** | Pesquisa de notas e comandos em `Ctrl + K`, com abertura da nota no editor compacto. |
| **Controle** | Tema, transparência, atalho, monitor, comportamento da cápsula, inicialização com o Windows e backups. |

## Instalação

1. Baixe o [instalador do TopNote 0.1.3 para Windows 64 bits](releases/TopNote_0.1.3_x64-setup.exe).
2. Execute o arquivo e abra **TopNote** pelo menu Iniciar.
3. Conclua a apresentação inicial e use `Ctrl + Shift + Space` para criar sua primeira nota.

**Requisitos:** Windows 10 ou 11 de 64 bits. O aplicativo usa WebView2; caso ele não esteja instalado, a preparação pode exigir acesso à internet. O executável ainda não tem assinatura digital e o SmartScreen pode exibir um aviso. Confira a origem e o hash do instalador antes de executá-lo.

**SHA-256 do instalador 0.1.3:** `578AEB5532A44040BFAF6E004B676927A5C3581243F7F8A1113C73E3B932E6D1`

### Primeiros passos

1. Abra o editor rápido pelo atalho ou clique na cápsula.
2. Dê um título à nota e escreva. O indicador **Salvo** confirma a gravação.
3. Clique no título do projeto para trocar de nota; o **+** junto a um projeto cria outra nota nele.
4. Abra o **Workspace** em **Mais ações** para organizar projetos, pastas e notas.
5. Arraste um arquivo para o editor para anexá-lo. A lista de anexos aparece após a importação.

### Atalhos principais

| Atalho | Ação |
| --- | --- |
| `Ctrl + Shift + Space` | Abrir ou recolher o editor rápido; configurável em **Configurações → Atalhos** |
| `Ctrl + K` | Pesquisar notas e comandos |
| `Ctrl + N` | Criar nota |
| `Ctrl + Shift + N` | Criar projeto |
| `Ctrl + P` | Abrir o seletor de projetos |
| `Ctrl + Enter` | Salvar imediatamente |
| `Esc` | Recolher o editor rápido |

## Seus dados

O TopNote guarda o banco SQLite, anexos e backups em `%LOCALAPPDATA%\com.topnote.desktop\`:

```text
com.topnote.desktop\
├── topnote.db
├── attachments\
├── backups\
└── topnote.log
```

Em **Configurações → Dados**, você pode criar ou restaurar um backup ZIP e programar backups diários ou semanais. A restauração substitui as notas e os anexos atuais após uma confirmação no aplicativo. Em **Configurações → Geral**, escolha se o TopNote inicia com o Windows e se a cápsula aparece ao entrar no sistema.

## Desenvolvimento

**Tecnologias:** React, TypeScript e Vite na interface; Tauri e Rust para janelas, integração com o Windows e persistência em SQLite.

**Requisitos para compilar:** Node.js e npm, Rust via rustup, Visual Studio Build Tools com compilador C++ e Windows SDK.

```powershell
git clone https://github.com/EmanuelCandido/TopNote.git
cd TopNote
npm ci
npm run desktop:dev
```

Para validar interface e código nativo:

```powershell
npm run build
npm test -- --configLoader runner
cd src-tauri
cargo test --locked
```

Para gerar o executável e o instalador NSIS, volte à raiz do projeto e execute `npm run desktop:build`. Os artefatos são criados em `src-tauri/target/release/` e `src-tauri/target/release/bundle/nsis/`.

### Estrutura do repositório

| Caminho | Conteúdo |
| --- | --- |
| [`src/`](src/) | Interface, editor, componentes e serviços |
| [`src-tauri/`](src-tauri/) | Aplicativo nativo, banco, anexos e backup |
| [`releases/`](releases/) | Instaladores compartilháveis |

## Contribuição e suporte

Problemas reproduzíveis, sugestões e correções são bem-vindos em [Issues](https://github.com/EmanuelCandido/TopNote/issues). Para propor uma alteração de código, abra uma issue com o contexto ou envie um pull request com a mudança, o motivo e como ela foi testada. Não inclua bancos de notas, anexos pessoais nem arquivos gerados pelo build.

## Licença

Distribuído sob a licença MIT. Consulte [`LICENSE`](LICENSE).
