# TopNote · Filmes de apresentação

Duas composições Remotion, com os vídeos exportados em [`../media/`](../media/). A versão anterior permanece disponível para comparação.

| | Nova versão · Astra | Versão anterior · Sol |
| --- | --- | --- |
| Composição | `TopNoteAstra` | `TopNotePromo` |
| Duração | 38,4 segundos | 30 segundos |
| Imagem | 1920 × 1080 · 60 fps | 1600 × 900 · 30 fps |
| Exportação | H.264 · CRF 18 · AAC estéreo 256 kbps | H.264 · CRF 20 |
| Áudio | Trilha original e efeitos sincronizados | Sem áudio |
| Arquivo | [TopNote-Astra.mp4](../media/TopNote-Astra.mp4) | [TopNote-promo.mp4](../media/TopNote-promo.mp4) |

As interfaces são recriações ilustrativas com dados fictícios. O ícone é a arte original do TopNote enviada pelo autor do projeto.

## Assistir e comparar

Abra [`../media/comparar.html`](../media/comparar.html) no navegador. O comparador permite exibir os vídeos lado a lado, ampliar cada versão e saltar para cenas equivalentes. As duas versões mantêm suas durações e velocidades originais.

Para servir a página localmente:

```powershell
cd promo
npm ci
npm run astra:preview
# http://127.0.0.1:4396
```

O servidor escuta apenas em `127.0.0.1`. Use `TOPNOTE_PROMO_PORT` para escolher outra porta. Encerre com `Ctrl + C`.

## Direção da nova versão

**Conceito:** uma ideia nasce, ganha forma, encontra um projeto e leva seus arquivos adiante.

A identidade combina papel claro, azul do ícone e a interface escura do aplicativo. A linha desenhada liga abertura e encerramento; títulos entram por recortes, teclas respondem à pressão e uma cápsula se transforma no editor. Os movimentos de cursor acompanham a mudança de estado da interface.

| Tempo | Cena |
| --- | --- |
| 0–4,2 s | “Boas ideias não esperam.” Ícone, notas soltas e traço desenhado |
| 4,2–10,2 s | Atalho, transformação da cápsula, digitação e salvamento |
| 10,2–17,4 s | Mover a ideia para um projeto e abrir suas outras notas |
| 17,4–22,2 s | Pesquisar “sexta” e abrir a nota na janela compacta |
| 22,2–29,4 s | Arrastar um PDF para a nota e copiar o anexo para outra pasta |
| 29,4–32,4 s | Dados locais, sem conta, controle do usuário |
| 32,4–38,4 s | Marca, assinatura e convite para experimentar no Windows |

### Som

A trilha é uma composição instrumental original a **100 BPM**: acordes suaves, notas percussivas, pulso discreto e resolução no encerramento. Cliques, digitação, confirmação e transições são sintetizados e sincronizados ao roteiro.

O gerador é determinístico, não usa gravações nem músicas de terceiros e exporta PCM estéreo a 48 kHz. O pico do WAV fica em **−2,3 dBFS**, com fade de saída. A trilha é distribuída sob a licença do projeto.

## Gerar a versão Astra

Requer **Node.js 24+**. As fontes, o ícone e a trilha estão incluídos; a renderização não depende de serviços de mídia externos.

```powershell
npm ci
npm run typecheck
npm run astra:score   # recria o WAV original
npm run astra:stills  # quadros de revisão (não versionados)
npm run astra:render  # ../media/TopNote-Astra.mp4
npm run astra:poster  # ../media/TopNote-Astra-poster.png
npm run studio       # prévia e edição no Remotion
```

O renderizador procura Chrome ou Edge no Windows. Em outro ambiente, defina `REMOTION_BROWSER_EXECUTABLE` com o caminho do navegador; na ausência de um caminho, o Remotion pode baixar o Chrome Headless Shell.

### Onde editar

| Arquivo | Responsabilidade |
| --- | --- |
| [`src/storyboard.ts`](src/storyboard.ts) | Tempos das cenas, resolução e taxa de quadros |
| [`src/TopNoteAstra.tsx`](src/TopNoteAstra.tsx) | Interfaces ilustradas, tipografia, cursores e animações |
| [`src/astra.css`](src/astra.css) | Composição visual, cores, espaçamentos e superfícies |
| [`scripts/score.mjs`](scripts/score.mjs) | Música original e efeitos sonoros |
| [`scripts/render-astra.mjs`](scripts/render-astra.mjs) | Exportação do vídeo, pôster e quadros de revisão |
| [`../media/comparar.html`](../media/comparar.html) | Comparador das duas versões |

Ao alterar o roteiro, ajuste os eventos sonoros correspondentes e execute novamente `astra:score`.

### Fontes e referências

[Manrope](https://github.com/google/fonts/tree/main/ofl/manrope) e [DM Sans](https://github.com/google/fonts/tree/main/ofl/dmsans) são incorporadas localmente, acompanhadas de suas licenças **SIL Open Font License** em [`public/fonts/`](public/fonts/). A interface usa ícones Lucide.

Referências técnicas: [renderização Remotion](https://www.remotion.dev/docs/renderer/render-media) e [áudio no Remotion](https://www.remotion.dev/docs/html5-audio).

## Reproduzir a versão anterior

```powershell
npm run render
npm run poster
```

A composição `TopNotePromo`, seus arquivos `src/TopNotePromo.tsx` e `src/styles.css`, além do vídeo e do pôster anteriores, foram preservados. Para apontar um navegador instalado nesses comandos, acrescente `-- --browser-executable 'C:\Program Files\Google\Chrome\Application\chrome.exe'`.
