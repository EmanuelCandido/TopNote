# Vídeo de apresentação do TopNote

Projeto Remotion editável que gera um vídeo de **30 segundos**, **1600 × 900 px**, **30 fps** e codec **H.264**. As telas são ilustrações da interface com dados fictícios; o ícone vem do próprio TopNote.

## Prévia e renderização

```powershell
npm ci
npm run studio
npm run render
npm run poster
```

Os arquivos finais são [`../media/TopNote-promo.mp4`](../media/TopNote-promo.mp4) e [`../media/TopNote-poster.png`](../media/TopNote-poster.png). O vídeo é gerado sem trilha sonora ou narração, pronto para receber áudio na edição se necessário.

No Windows, se a CLI tentar baixar o Chrome Headless Shell apesar de o Chrome estar instalado, passe `--browser-executable 'C:\Program Files\Google\Chrome\Application\chrome.exe'` ao comando `remotion render` ou `remotion still`.

## Cenas

| Tempo | Conteúdo |
| --- | --- |
| 0–4 s | Marca e atalho global |
| 4–11 s | Captura rápida e salvamento automático |
| 11–19 s | Workspace, projetos e pastas |
| 19–26 s | Anexos e cópia para o Explorer |
| 26–30 s | Encerramento e endereço do projeto |

Edite o roteiro e as animações em [`src/TopNotePromo.tsx`](src/TopNotePromo.tsx), o visual em [`src/styles.css`](src/styles.css) e a duração em [`src/root.tsx`](src/root.tsx). A composição se chama `TopNotePromo`.
