# AGENTS.md - NXGEO

Este arquivo e para qualquer proxima sessao entender o projeto sem depender do historico do chat.

## Identidade do projeto

- Nome interno do app: NXGEO.
- Código-fonte local: /Users/hil/NXPROJETOS/NX/apps/nxgeo.
- Aplicativo compilado para publicação: /Users/hil/NXPROJETOS/NX/dist-site/nxgeo.
- Package name: nxgeo.
- Stack: React + TypeScript + Vite + MapLibre GL + proj4 + JSZip + oxlint.
- App principal: src/App.tsx. Hoje quase toda a regra esta nesse arquivo.
- Nao ha repositorio Git inicializado nesta pasta nesta data. Confira antes de assumir historico.

## Como rodar

    cd "/Users/hil/NXPROJETOS/NX/apps/nxgeo"
    npm install
    npm run dev

Valide mudancas com:

    npm run build
    npm run lint

Se precisar testar no browser, use a porta informada pelo Vite. Na sessao de 2026-07-09 o servidor estava em http://localhost:5174, mas isso pode mudar.

## Contexto do produto

NXGEO e uma ferramenta web para sobrepor planta, loteamento ou area tecnica em cima de mapa real, usando coordenadas e importacao de arquivos geograficos. O objetivo e dar ao cliente uma tela simples para conferir implantacao, ajustar visualmente, exportar imagem 4K e compartilhar dados GIS.

O usuario final nao deve ver uma marcacao laranja agressiva como primeira leitura. A primeira leitura deve ser a demarcacao original/importada do projeto. Controles de ajuste existem, mas devem ficar ocultos ate o usuario pedir.

## Decisoes importantes ja tomadas

- Pontos SE, SD, ID, IE significam Superior esquerdo, Superior direito, Inferior direito e Inferior esquerdo.
- Esses pontos sao controle de georreferenciamento, nao sao o desenho principal do lote.
- Controle de ajuste com cantos e poligono tecnico deve iniciar oculto.
- Filtros do mapa devem permitir mostrar/ocultar: projeto importado, pontos PDNEZ, rotulos e controle de ajuste.
- A cor do projeto e a cor do controle devem ser editaveis por seletor de cor e swatches.
- A cor original/padrao do projeto importado e verde #22c55e, nao laranja.
- Cor padrao do controle e cinza #64748b, e o controle fica oculto por padrao.
- Carregar imagem foi clarificado como Planta PNG/JPG.
- Importar estudo virou Abrir NXGEO, porque abre JSON interno salvo pelo proprio app.
- Exportar estudo virou Salvar NXGEO.
- Exportacao 4K deve baixar apenas um arquivo PNG, com um clique.
- Nome do PNG 4K deve seguir `NX-DD.MM.AAAA-NOMEDOPROJETO.png`.
- Exportacao 4K nao deve baixar PGW, PRJ, JSON auxiliar, prancha ou qualquer outro arquivo junto.
- O PNG 4K deve respeitar os filtros atuais do mapa.
- O PNG 4K deve incluir rodape desenhado dentro da imagem final, com marca NX Projetos/NXGEO e dados da prancha.
- O rodape do PNG 4K deve manter visivel a atribuicao da base cartografica e dos rotulos utilizados.
- O PNG 4K deve exportar a area visivel atual do mapa, nao reenquadrar automaticamente o projeto inteiro.
- A marca NX no rodape 4K deve usar o SVG real (`public/nx-white.svg`), nao texto "NX" desenhado manualmente.
- O usuario precisa conseguir escolher Mapa, Satelite ou Clarity.
- O usuario precisa conseguir ligar/desligar Nomes de ruas sobre o satelite, estilo Google Earth.
- Nomes de ruas deve iniciar ligado por padrao, inclusive ao limpar estudo e ao abrir NXGEO antigo sem essa preferencia.

## Funcionalidades atuais

- Acesso por código único de seis dígitos enviado por e-mail com Supabase Auth, confirmado dentro do próprio NXGEO.
- Autorizacao por `public.nxgeo_members`, aplicada por Auth Hook antes de criar o usuario e verificada novamente depois da sessao.
- Marcelo (`marcelo.topografia@gmail.com`) e o administrador inicial.
- Papeis de produto: `admin` gerencia equipe e todas as pastas; `user` trabalha somente nas pastas atribuidas.
- Painel com saudacao, pastas, mapas recentes, miniaturas e download rapido do ultimo PNG salvo.
- Mapas, miniaturas e exports ficam no bucket privado `nxgeo-workspace`, protegidos pela permissao da pasta.
- Alteracoes de equipe, pastas e mapas geram auditoria; exclusoes usam soft delete.
- Sessao persistente no navegador e botao de saida no painel.
- NXGEO pode ser instalado como PWA: Chrome usa o botao Instalar aplicativo e iPhone recebe instrucao para Adicionar a Tela de Inicio no Safari.
- Upload de planta PNG/JPG/SVG como imagem raster sobre o mapa.
- Entrada manual de quatro pontos em UTM ou Lat/Lon.
- Conversao UTM para WGS84 via proj4.
- Base OSM e satelite via MapLibre.
- Variação de satelite Esri e Esri Clarity quando disponivel.
- Toggle de nomes de ruas sobre a base de satelite.
- Opacidade da planta.
- Arrasto de quatro marcadores de controle quando o controle esta visivel.
- Importacao KML/KMZ.
- Importacao PDNEZ/TXT/CSV.
- Importacao DXF.
- Exportacao NXGEO JSON.
- Exportacao GeoJSON, KML e KMZ.
- Exportacao PNG 4K.
- Filtros visuais de projeto, pontos, rotulos e controle.
- Desfazer, limpar, centralizar e demo.

## DXF atual

O importador DXF foi implementado em src/App.tsx e cobre entidades comuns de CAD:

- LINE
- LWPOLYLINE
- POLYLINE
- POINT
- CIRCLE
- ARC

Comportamento:

- Se as coordenadas parecem longitude/latitude, mantem como Lat/Lon.
- Se parecem CAD/UTM, converte usando zona e hemisferio selecionados no painel. Padrao do app: zona 23, hemisferio S.
- Polilinha fechada vira poligono.
- Linha aberta vira linha.
- Circulo vira poligono aproximado.
- Arco vira linha.
- Depois de importar, o projeto aparece e o controle de ajuste continua oculto por padrao.

Limites conhecidos do DXF:

- Nao ha suporte completo para INSERT, BLOCK, SPLINE, HATCH, bulge de polyline e transformacoes complexas.
- Se o cliente mandar DXF com bloco aninhado, spline ou hatch, precisa evoluir parser ou usar biblioteca DXF dedicada.

## Pontos sensiveis

- src/App.tsx e grande. Evite refatorar tudo junto enquanto estiver corrigindo demanda de cliente.
- Nao quebrar a regra: controle de ajuste oculto por padrao.
- Nao voltar laranja como cor principal.
- Nao fazer export 4K disparar multiplos downloads.
- Nao voltar o nome antigo `nxgeo-mapa-4k.png`; o padrao atual e `NX-DD.MM.AAAA-NOMEDOPROJETO.png`.
- Nao voltar o PNG 4K para `fitBounds` do projeto inteiro; o cliente quer exportar a janela visivel atual do mapa.
- Ao mexer em exportacao, conferir filtros do mapa tambem no export.
- Ao mexer em base cartografica, conferir que o PNG 4K usa a mesma base/toggle de ruas da tela.
- Ao mexer em importacao, conferir hasControlGeometry, importedGeometries, surveyPoints, overlayOptions, corners, inputs e mode.

## Checklist antes de dizer que terminou

    npm run build
    npm run lint

Se mexer em botao, exportacao ou mapa, fazer teste visual real no navegador quando possivel. Se o browser/proxy estiver indisponivel, avisar isso claramente.

## Arquivos de retomada

- MANIFESTO.md: norte de produto e experiencia.
- CHANGELOG.md: linha do tempo das mudancas ja feitas.
- docs/SESSION_MIN.md: briefing muito claro para sessao com minimo raciocinio.
- docs/SESSION_XHIGH.md: complemento tecnico para sessao com raciocinio xhigh.
