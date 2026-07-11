# SESSION_MIN - Retomada com minimo de raciocinio

Leia isso primeiro se voce caiu numa sessao economica ou com pouca capacidade de contexto.

## Onde esta o projeto

    cd "/Users/hil/NXPROJETOS/NX/apps/nxgeo"

App principal:

    src/App.tsx

## O que e o NXGEO

E um app web que coloca planta/loteamento/area em cima de mapa real. Ele importa imagem, KML/KMZ, PDNEZ e DXF. Depois exporta imagem PNG 4K e arquivos GIS.

## Comandos obrigatorios para validar

    npm run build
    npm run lint

Se mexer em botao ou mapa, testar no navegador tambem.

## Regra mais importante

Nao deixar a marcacao laranja forte aparecer como primeira coisa.

O projeto importado deve aparecer primeiro. Os pontos de controle SE, SD, ID, IE devem ficar ocultos por padrao.

## O que sao SE, SD, ID, IE

- SE: Superior esquerdo.
- SD: Superior direito.
- ID: Inferior direito.
- IE: Inferior esquerdo.

Eles sao pontos para ajustar a imagem/geometria no mapa. Nao sao a area final do cliente.

## Como os filtros devem funcionar

Existe uma area chamada Filtros do mapa.

Ela precisa controlar:

- Projeto importado.
- Pontos PDNEZ.
- Rotulos.
- Controle de ajuste.
- Cor do projeto.
- Cor do controle.

Padrao correto:

- Projeto importado ligado.
- Pontos PDNEZ ligados.
- Rotulos ligados.
- Controle de ajuste desligado.
- Cor do projeto verde #22c55e.
- Cor do controle cinza #64748b.

## Exportacao PNG 4K

O botao se chama PNG 4K.

Ele deve:

- funcionar com um clique;
- baixar um unico arquivo;
- nome do arquivo: `NX-DD.MM.AAAA-NOMEDOPROJETO.png`;
- respeitar os filtros atuais do mapa;
- ficar desabilitado enquanto esta gerando;
- nao baixar .pgw, .prj, .json auxiliar ou outro PNG junto.

## Importacoes

### Planta PNG/JPG

Serve para carregar imagem da planta sobre o mapa. Se nao houver coordenada ainda, ela aparece como rascunho e depois o usuario importa dados ou aplica coordenadas.

### Abrir NXGEO

Abre JSON salvo pelo proprio NXGEO. Nao e importador generico.

### Importar KML/KMZ

Importa geometrias de Google Earth/GIS.

### Importar PDNEZ

Importa pontos topograficos. Pode gerar poligonal.

### Importar DXF

Importa arquivo CAD simples.

Suporte atual:

- LINE
- LWPOLYLINE
- POLYLINE
- POINT
- CIRCLE
- ARC

Nao prometer suporte total para DXF com BLOCK, INSERT, SPLINE, HATCH ou CAD muito complexo.

## Quando mexer no codigo

Procure em src/App.tsx por estes termos:

- defaultOverlayOptions
- importDxf
- exportImage4k
- importKmlKmz
- importPdnez
- Filtros do mapa
- PNG 4K
- Abrir NXGEO
- Salvar NXGEO

Depois rode build e lint.

## O que dizer se terminar

Diga objetivamente:

- o que mudou;
- onde mudou;
- se npm run build passou;
- se npm run lint passou;
- se testou no navegador ou se nao conseguiu testar visualmente.
