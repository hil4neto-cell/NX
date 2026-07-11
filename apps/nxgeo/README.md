# NXGEO

Ferramenta web para colocar planta baixa/loteamento em cima de mapa real usando georreferenciamento por quatro cantos.

## Base aberta pesquisada

- `publiclab/Leaflet.DistortableImage`: boa referencia para arrastar imagem pelos cantos em Leaflet. Serve como inspiracao para ajuste manual fino.
- `Viglino/Map-georeferencer`: prova de conceito OpenLayers com pontos de controle, transformacao Helmert/afim e comparacao lado a lado.
- `allmaps/allmaps`: suite TypeScript mais robusta para mapas georreferenciados, IIIF e renderizacao WebGL. Forte demais para MVP simples, mas boa candidata para fase avancada.
- `MapLibre GL JS ImageSource`: foi a base do MVP, porque aceita uma imagem com quatro coordenadas nos cantos e renderiza direto no mapa.

## O que o MVP faz

- Upload de uma planta em PNG/JPG/SVG.
- Entrada das quatro coordenadas em UTM ou lat/lon.
- Conversao UTM para WGS84 usando `proj4`.
- Sobreposicao da planta em mapa OSM ou satelite.
- Ajuste fino arrastando os quatro marcadores laranja.
- Controle de opacidade.
- Exportacao do projeto em JSON e do poligono em GeoJSON.

## Como rodar

```bash
npm install
npm run dev
```

## Ordem dos cantos

Use sempre esta ordem:

1. Superior esquerdo
2. Superior direito
3. Inferior direito
4. Inferior esquerdo

No UTM, pode colar texto no formato visto na imagem:

```text
E 521941.330  N 9535373.850
```

Para a regiao do exemplo, o padrao inicial esta em zona UTM 23, hemisferio Sul. Se a obra estiver mais a leste/oeste, ajuste a zona antes de aplicar.

## Proxima etapa com IA

O fluxo correto nao e pedir para a IA desenhar a planta direto no mapa de primeira, porque ela tende a errar escala e canto. O caminho melhor:

1. Ler a planta enviada com OCR/visao.
2. Detectar as quatro etiquetas de coordenadas.
3. Ordenar automaticamente os cantos.
4. Preencher os campos UTM.
5. Aplicar no mapa e deixar o humano ajustar os marcadores.

Esse MVP ja deixa a parte deterministica pronta. A IA entra depois como assistente de extracao, nao como dona da geometria. Assim a coisa nao vira um carnaval torto em cima do satelite.

## Documentacao de retomada

Para proximas sessoes, leia estes arquivos antes de mexer no app:

- AGENTS.md: contexto operacional para agentes.
- MANIFESTO.md: norte de produto e experiencia.
- CHANGELOG.md: historico manual das mudancas importantes.
- docs/SESSION_MIN.md: retomada em linguagem muito clara, para sessao com minimo raciocinio.
- docs/SESSION_XHIGH.md: complemento tecnico para sessao com raciocinio xhigh.
