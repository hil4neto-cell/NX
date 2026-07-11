# CHANGELOG - NXGEO

Registro manual de mudancas importantes. Data base: 2026-07-09.

## 2026-07-11 - Integracao ao site e atribuicao cartografica

- Preparado build do NXGEO na rota `/nxgeo` do site institucional.
- Marca NX no aplicativo passou a voltar para o site principal.
- Adicionada atribuicao da base cartografica e dos rotulos no rodape do PNG 4K.
- Rota publica marcada como `noindex` enquanto a autenticacao ainda nao foi implementada.

## 2026-07-09 - Documentacao de retomada

- Criados arquivos de contexto para proximas sessoes: AGENTS.md, MANIFESTO.md, CHANGELOG.md, docs/SESSION_MIN.md e docs/SESSION_XHIGH.md.

## 2026-07-09 - Importacao DXF

- Adicionado botao Importar DXF.
- Implementado parser DXF interno para entidades comuns: LINE, LWPOLYLINE, POLYLINE, POINT, CIRCLE e ARC.
- Implementada deteccao simples de coordenadas: coordenadas pequenas em faixa valida viram longitude/latitude; coordenadas CAD/UTM sao convertidas usando zona e hemisferio selecionados no painel.
- Polilinhas fechadas viram poligonos.
- Linhas abertas viram linhas.
- Circulos viram poligonos aproximados.
- Arcos viram linhas aproximadas.
- DXF importado entra no mesmo fluxo visual de KML/PDNEZ.
- Projeto importado aparece por padrao; controle de ajuste fica oculto por padrao.
- Validado com npm run build e npm run lint.
- Observacao: teste visual via Chrome/proxy nao ficou disponivel na sessao em que essa funcao foi criada.

## 2026-07-09 - UX de importacao e controles

- Explicado e ajustado o papel dos cantos SE, SD, ID, IE: Superior esquerdo, Superior direito, Inferior direito e Inferior esquerdo.
- Esses cantos sao pontos de controle de georreferenciamento, nao a area principal do projeto.
- Controle de ajuste passou a iniciar oculto.
- Controle de ajuste aparece apenas em Filtros do mapa > Controle de ajuste.
- Carregar imagem foi clarificado como Planta PNG/JPG.
- Ao carregar imagem sem geometria, o mapa centraliza na planta como rascunho.
- Importar estudo foi renomeado para Abrir NXGEO.
- Estudo na exportacao foi renomeado para Salvar NXGEO.
- Validado com npm run build e npm run lint.

## 2026-07-09 - Filtros e cores do mapa

- Criada area Filtros do mapa.
- Adicionados toggles para projeto importado, pontos PDNEZ, rotulos e controle de ajuste.
- Adicionados controles de cor para cor do projeto e cor do controle.
- Cor padrao do projeto importado: verde #22c55e.
- Cor padrao do controle: cinza #64748b.
- Removido destaque laranja forte como visual inicial.
- A demarcacao original/importada do projeto e a primeira leitura da tela.
- Validado com npm run build e npm run lint.

## 2026-07-09 - Exportacao PNG 4K

- Botao de exportacao 4K renomeado para PNG 4K.
- Um clique baixa apenas nxgeo-mapa-4k.png.
- PNG 4K agora desenha o rodape dentro do proprio arquivo exportado.
- Rodape do PNG 4K inclui marca NX Projetos/NXGEO, data, projeto, endereco e marca/observacao da prancha.
- Removidos downloads extras no fluxo 4K: prancha PNG, .pgw, .prj e .ref.json.
- Adicionada trava contra clique duplo/rapido durante a renderizacao.
- Botao fica desabilitado enquanto Gerando 4K.
- Exportacao 4K passou a respeitar filtros visuais do mapa: projeto importado, pontos PDNEZ, rotulos, controle de ajuste e cores escolhidas.
- Validado com npm run build, npm run lint e teste real headless: Demo + PNG 4K gerou exatamente um download chamado nxgeo-mapa-4k.png.

## 2026-07-10 - Marca NX, nomes de ruas e bases de satelite

- Rodape do PNG 4K passou a usar o SVG real da marca NX em `public/nx-white.svg`, em vez de desenhar "NX" como texto manual.
- Mantido o rodape atual com Projeto, Endereco, Marca / Observacao e nome NX Projetos.
- Base cartografica agora tem seletor: Mapa, Satelite e Clarity.
- Satelite usa Esri World Imagery.
- Clarity usa Esri World Imagery Clarity quando disponivel.
- Adicionado toggle Nomes de ruas para sobrepor rotulos de ruas sobre a imagem de satelite.
- O PNG 4K respeita a base escolhida e tambem exporta os nomes de ruas quando o toggle esta ligado.
- Validado com npm run build, npm run lint e teste real via Chrome DevTools: Demo + Clarity + Nomes de ruas + PNG 4K baixou um unico arquivo `nxgeo-mapa-4k.png` com 3840x2160.

## 2026-07-10 - Nome personalizado e enquadramento visivel no PNG 4K

- Nome do arquivo PNG 4K mudou para o padrao `NX-DD.MM.AAAA-NOMEDOPROJETO.png`.
- O nome do projeto vem do campo Projeto da prancha, convertido para formato seguro em caixa alta e com hifens.
- Exportacao PNG 4K deixou de enquadrar automaticamente o projeto inteiro com `fitBounds`.
- Exportacao PNG 4K agora usa a area visivel atual do mapa como referencia: se o usuario deu zoom ou deslocou o mapa, o PNG segue essa janela em alta resolucao.
- O rodape continua separado dentro do mesmo PNG final, sem cobrir a area de mapa renderizada.
- Validado com npm run build, npm run lint e teste real via Chrome DevTools: projeto `Residencial Sao Jose` gerou `NX-10.07.2026-RESIDENCIAL-SAO-JOSE.png` em 3840x2160.

## 2026-07-10 - Nomes de ruas ligados por padrao

- Toggle Nomes de ruas agora inicia ligado por padrao.
- Limpar estudo tambem volta com Nomes de ruas ligado.
- Arquivos NXGEO antigos que nao tinham essa preferencia salva abrem com Nomes de ruas ligado.

## Estado inicial do MVP antes das mudancas acima

- App React/Vite para georreferenciar planta/loteamento.
- Upload de imagem.
- Quatro coordenadas em UTM ou Lat/Lon.
- Conversao com proj4.
- Mapa com MapLibre.
- Controle por quatro cantos.
- Exportacao JSON/GeoJSON.
