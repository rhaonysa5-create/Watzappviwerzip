# WhatsApp Viewer — Visualizador de Conversas Exportadas

Aplicativo web local para visualizar conversas exportadas do WhatsApp em uma interface semelhante ao app oficial.

## Como usar

### Opção 1 — Mais simples (recomendado)

1. Abra o arquivo `index.html` diretamente no navegador (Chrome, Edge, Firefox ou Safari).
2. Clique no botão **Carregar conversas**.
3. Selecione o arquivo **ZIP** exportado do WhatsApp (o mesmo que contém o `.txt` e as mídias).
4. A conversa aparecerá na lista à esquerda. Clique nela para ler as mensagens.

Você também pode **arrastar e soltar** o ZIP em qualquer lugar da janela.

Para testar imediatamente, use o arquivo `sample-chat.zip` incluído nesta pasta (é o export fornecido, sem o APK grande).

### Opção 2 — Servidor local (opcional)

Se preferir servir os arquivos via HTTP:

```bash
# Na pasta do aplicativo
python3 -m http.server 8080
# ou
npx serve .
```

Depois abra `http://localhost:8080` no navegador.

## O que o aplicativo faz

- Lê o arquivo de texto da conversa dentro do ZIP (`Conversa do WhatsApp com ….txt` ou equivalente).
- Localiza automaticamente todas as mídias referenciadas (imagens, áudios `.opus`, stickers `.webp`, vídeos, documentos, contatos `.vcf`, etc.).
- Exibe as mensagens em bolhas com data, horário e identificação do remetente.
- Reproduz áudios e mostra imagens/stickers diretamente na conversa.
- Permite baixar anexos genéricos.
- Funciona 100% localmente — nenhum dado é enviado para servidores externos.

## Formato esperado do ZIP

Exportação padrão do WhatsApp:

```
meu-export.zip
├── Conversa do WhatsApp com +55 ….txt
├── IMG-2023….jpg
├── PTT-2023….opus
├── STK-2023….webp
└── …
```

O aplicativo procura qualquer arquivo `.txt` na raiz (ou subpastas) e associa as mídias pelo nome do arquivo.

## Requisitos

- Navegador moderno com suporte a JavaScript e Blob URLs.
- Biblioteca JSZip carregada via CDN (internet necessária apenas na primeira carga da página; depois tudo roda offline com o ZIP já selecionado).

## Observações

- Mensagens com “Mídia oculta” ou arquivos ausentes no ZIP são indicadas claramente.
- O aplicativo **não modifica** nem exclui nenhum arquivo original.
- Conversas grandes com muitos áudios/imagens podem consumir mais memória do navegador (tudo fica em memória após o carregamento do ZIP).

## Estrutura do projeto

```
whatsapp-viewer/
├── index.html      # Interface principal
├── styles.css      # Estilos (tema escuro estilo WhatsApp)
├── app.js          # Lógica de parsing e renderização
└── README.md       # Este arquivo
```

Desenvolvido para funcionar com o export fornecido e com qualquer outro ZIP de conversa do WhatsApp no formato clássico.
