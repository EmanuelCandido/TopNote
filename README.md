<p align="center">
  <img src="src/assets/topnote-icon.png" alt="Ícone do TopNote" width="104" />
</p>

<h1 align="center">TopNote</h1>

<p align="center">
  <strong>Suas ideias a um atalho de distância.</strong>
  <br />
  O aplicativo de notas para Windows que abre na hora, não interrompe seu trabalho e guarda tudo no seu computador.
</p>

<p align="center">
  <img alt="Versão 0.1.4" src="https://img.shields.io/badge/vers%C3%A3o-0.1.4-4387e8" />
  <img alt="Windows 10 e 11" src="https://img.shields.io/badge/plataforma-Windows%2010%20%7C%2011-0078d4" />
  <img alt="Licença MIT" src="https://img.shields.io/badge/licen%C3%A7a-MIT-31a17f" />
  <img alt="Dados locais" src="https://img.shields.io/badge/dados-100%25%20locais-333b4d" />
</p>

<p align="center">
  <a href="releases/TopNote_0.1.4_x64-setup.exe"><strong>Baixar para Windows</strong></a>
  · <a href="#como-funciona">Como funciona</a>
  · <a href="#para-desenvolvedores">Para desenvolvedores</a>
  · <a href="https://github.com/EmanuelCandido/TopNote/issues">Suporte</a>
</p>

https://github.com/user-attachments/assets/10214b6d-a02f-4c02-a6e4-a91fd7b529e8

## Anotar não deveria custar o seu foco

Toda ideia importante chega no pior momento: no meio de uma reunião, de um código ou de uma conversa. Abrir um aplicativo pesado, esperar carregar, escolher onde salvar — nesse tempo a ideia já foi embora.

O **TopNote** resolve isso com uma cápsula discreta no topo da tela. Um atalho abre o editor sobre o que você estiver fazendo; ao terminar, ele se recolhe e devolve o foco. Suas notas são salvas sozinhas, organizadas em projetos quando você quiser, e ficam no seu computador: sem conta, sem nuvem, sem assinatura.

## Por que escolher o TopNote

| | |
| --- | --- |
| **Rápido de verdade** | `Ctrl + Shift + Space` abre o editor em um instante, de qualquer programa. A tecla `Esc` recolhe. |
| **Animações fluidas** | O painel nasce da cápsula e volta para ela com movimento de mola, sem travar nem tirar sua atenção. |
| **Seus dados, só seus** | Tudo fica em um banco local. Nenhuma nota sai do computador e não é preciso criar conta. |
| **Leve** | Instalador de cerca de 3,5 MB, uso de CPU próximo de zero em repouso e cerca de 235 MB de memória, quase toda do WebView2 que desenha a interface. |
| **Nunca perde uma linha** | Salvamento automático a cada alteração, histórico de versões de cada nota e backups programados. |
| **Cresce com você** | Começa como bloco de notas rápido e vira um espaço completo de projetos, pastas e anexos no Workspace. |

## Como funciona

**1. Capture.** Pressione o atalho em qualquer lugar. O editor compacto aparece sobre a área de trabalho, já com o cursor na nota. Escreva e continue o que estava fazendo.

**2. Organize quando fizer sentido.** Notas novas começam sem projeto. Agrupe-as em projetos e pastas, fixe as favoritas e use a lixeira e o arquivo sem medo de apagar sem querer.

**3. Encontre.** `Ctrl + K` pesquisa em todas as notas e executa comandos do aplicativo, sem tirar as mãos do teclado.

**4. Aprofunde no Workspace.** Para revisar com calma, abra o Workspace: barra lateral com projetos, lista de notas e editor completo em uma janela maior.

## Funcionalidades

| Área | O que está incluído |
| --- | --- |
| **Captura** | Atalho global configurável, cápsula discreta sempre à mão e salvamento automático. |
| **Organização** | Projetos com várias notas, pastas, favoritos, recentes, arquivo e lixeira. |
| **Edição** | Texto formatado, listas, checklists, links, imagens, blocos de código e histórico de versões da nota. |
| **Arquivos** | Anexos por seleção, colagem ou arraste. Abra o arquivo, localize-o no Explorer ou copie-o para outra pasta arrastando pelo nome. |
| **Busca** | Pesquisa de notas e comandos com `Ctrl + K`. |
| **Aparência** | Visual sólido em grafite, tema claro, escuro ou do sistema, escala da interface e opção de desligar animações. |
| **Controle** | Atalho, monitor, comportamento da cápsula, inicialização com o Windows e backups. |

## Instalação

1. Baixe o [instalador do TopNote 0.1.4 para Windows 64 bits](releases/TopNote_0.1.4_x64-setup.exe).
2. Execute o arquivo e abra **TopNote** pelo menu Iniciar.
3. Conclua a apresentação inicial e use `Ctrl + Shift + Space` para criar sua primeira nota.

**Requisitos:** Windows 10 (versão 1809 ou mais recente) ou Windows 11, 64 bits. O aplicativo usa o WebView2, que já acompanha o Windows 11; se faltar, a instalação pode pedir acesso à internet. Para bom desempenho, recomendamos 8 GB de RAM; com 4 GB funciona, e desligar as animações nas configurações ajuda em computadores mais modestos.

**Segurança:** o instalador ainda não tem assinatura digital, então o SmartScreen pode exibir um aviso. Confira a origem e o hash antes de executar.

**SHA-256 do instalador 0.1.4:** `F2CA3E56A9507168C084C6D961B955368B21F3278A5E859F804981BFC7F84F11`

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

## Privacidade e dados

O TopNote funciona sem conta e sem internet. Banco de dados, anexos e backups ficam em `%LOCALAPPDATA%\com.topnote.desktop\`:

```text
com.topnote.desktop\
├── topnote.db
├── attachments\
├── backups\
└── topnote.log
```

Em **Configurações → Dados**, crie ou restaure um backup ZIP e programe backups diários ou semanais. A restauração substitui as notas e os anexos atuais, sempre depois de uma confirmação. Em **Configurações → Geral**, escolha se o TopNote inicia com o Windows e se a cápsula aparece ao entrar no sistema.

## Para desenvolvedores

**Tecnologias:** React, TypeScript e Vite na interface; Tauri e Rust para janelas, animações nativas, integração com o Windows e persistência em SQLite.

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
npm test
cd src-tauri
cargo test --locked
```

Para gerar o executável e o instalador NSIS, execute `npm run desktop:build` na raiz. Os artefatos são criados em `src-tauri/target/release/` e `src-tauri/target/release/bundle/nsis/`.

| Caminho | Conteúdo |
| --- | --- |
| [`src/`](src/) | Interface, editor, componentes, estilos e animações |
| [`src-tauri/`](src-tauri/) | Aplicativo nativo, janelas, banco, anexos e backup |
| [`releases/`](releases/) | Instaladores compartilháveis |
| [`docs/`](docs/) | Filme de apresentação do TopNote |

## Suporte e contribuição

Encontrou um problema ou tem uma ideia? Abra uma issue em [Issues](https://github.com/EmanuelCandido/TopNote/issues) com o contexto e, se possível, os passos para reproduzir. Pull requests são bem-vindos: descreva a mudança, o motivo e como ela foi testada. Não inclua bancos de notas, anexos pessoais nem arquivos gerados pelo build.

## Licença

Distribuído sob a licença MIT. Consulte [`LICENSE`](LICENSE).
