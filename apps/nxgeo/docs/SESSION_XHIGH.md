# SESSION_XHIGH - Complemento tecnico para raciocinio xhigh

Este arquivo complementa docs/SESSION_MIN.md. Use quando a proxima sessao tiver capacidade alta de analise e puder mexer com mais seguranca.

## Estado arquitetural

O app esta concentrado em src/App.tsx com cerca de 1900 linhas. Isso reduz troca de arquivos, mas aumenta risco de regressao por edicao ampla. Para demandas urgentes, prefira mudancas cirurgicas. Para uma etapa de saneamento, a melhor divisao futura seria:

- src/geo/coordinates.ts: UTM, Lat/Lon, bounds, conversoes.
- src/importers/kml.ts: KML/KMZ.
- src/importers/pdnez.ts: PDNEZ/TXT/CSV.
- src/importers/dxf.ts: DXF.
- src/exporters/kml.ts: KML/KMZ e GeoJSON.
- src/exporters/png4k.ts: render offscreen 4K.
- src/map/layers.ts: fontes, camadas, filtros e estilos MapLibre.
- src/components/Panel.tsx: controles laterais.

Nao fazer essa refatoracao junto de correcao de bug de cliente, a menos que seja inevitavel.

## Modelo mental dos dados

Tipos importantes em src/App.tsx:

- Coordinate: [lng, lat] depois de convertido para mapa.
- FourCoordinates: quatro cantos na ordem SE, SD, ID, IE pelo significado visual, mas tecnicamente sao coordenadas longitude/latitude.
- OverlayOptions: estado dos filtros e cores.
- ImportedGeometry: geometrias vindas de KML/KMZ/PDNEZ/DXF.
- SurveyPoint: pontos PDNEZ.
- SavedProject: formato salvo em nxgeo-estudo.json.
- AppSnapshot: usado para desfazer.

Estados criticos:

- corners: quatro cantos do controle/imagem.
- hasControlGeometry: se ha geometria de controle valida.
- importedGeometries: geometrias reais importadas.
- surveyPoints: pontos topograficos.
- overlayOptions: visibilidade e cores.
- mode, zone, hemisphere, inputs: entrada manual de coordenadas.
- imageUrl, imageName, opacity: planta raster.

## Invariantes que nao devem quebrar

- corners sempre deve ter quatro coordenadas.
- MapLibre espera coordenadas em [lng, lat].
- Entrada Lat/Lon do usuario pode vir como lat, lng, mas internamente deve virar [lng, lat].
- Entrada UTM deve converter para WGS84 antes de ir para o mapa.
- Filtros nunca devem remover dados, apenas mudar visibilidade/cor.
- defaultOverlayOptions.showControl deve permanecer false.
- Importadores externos devem chamar scheduleFitToData ou equivalente para centralizar nos dados.
- Importadores devem atualizar imageName com importedFileName para deixar claro qual arquivo entrou.
- Export 4K deve usar mapa offscreen, esperar load/idle e entao baixar um unico blob PNG.
- Lock export4kLockRef e isExporting4k protegem contra clique duplo; nao remover.

## Fluxo de importacao

### KML/KMZ

importKmlKmz chama readKmlText, depois extractKmlGeometries, depois coordinatesToFourCorners.

Efeitos esperados:

- setHasControlGeometry(true).
- setSurveyPoints([]).
- setImportedGeometries(extracted.importedGeometries).
- setOverlayOptions({ ...defaultOverlayOptions, showImported: true, showControl: false }).
- setMode('latlon').
- setInputs(imported.corners.map(coordinateToInput)).
- scheduleFitToData(...).

### PDNEZ

importPdnez chama parsePdnezText(text, zone, hemisphere).

Efeitos esperados:

- Cria SurveyPoint[].
- Cria poligonal como ImportedGeometry quando ha 3+ pontos.
- Usa UTM atual do painel.
- Mantem pontos PDNEZ visiveis.
- Controle de ajuste oculto por padrao.

### DXF

importDxf chama extractDxfGeometries(text, zone, hemisphere).

Pipeline:

1. readDxfPairs le pares grupo/valor.
2. Loop entra apenas na section ENTITIES.
3. Entidades suportadas viram DxfRawGeometry.
4. dxfLooksLikeLngLat decide se ja e Lat/Lon.
5. convertDxfGeometry converte UTM para WGS84 quando necessario.
6. coordinatesToFourCorners cria envelope/controle.
7. Estado do app e atualizado como nos outros importadores.

Risco atual do DXF:

- LWPOLYLINE com bulge nao curva; vira segmento reto.
- BLOCK/INSERT nao e expandido.
- SPLINE nao e lida.
- HATCH nao e lida.
- Layer name e aproveitado via dxfLayerName, mas sem hierarquia CAD complexa.
- Arquivos em CRS local arbitrario podem encaixar errado se zona/hemisferio estiverem errados.

## Fluxo visual e camadas

footprintGeoJson deve representar papeis diferentes por role:

- imported: area/linha/ponto importado de arquivo externo.
- survey: ponto topografico.
- corner: canto de controle.
- footprint: poligono de controle/envelope.

As camadas MapLibre usam filtros por role. Isso e importante para export 4K e tela normal terem comportamento igual.

Camadas de controle devem depender de overlayOptions.showControl.

Camadas de projeto importado devem depender de overlayOptions.showImported.

Labels devem depender de overlayOptions.showLabels junto da camada correspondente.

## Export PNG 4K

exportImage4k cria um container offscreen de 3840x2160 e um novo maplibregl.Map com preserveDrawingBuffer: true.

Pontos importantes:

- export4kLockRef.current evita dupla execucao mesmo antes do React desabilitar botao.
- isExporting4k altera texto do botao para Gerando 4K e desabilita.
- O mapa offscreen recria fontes/camadas respeitando overlayOptions.
- O download deve usar `downloadBlob(exportFileName(metadata), png)` e gerar somente `NX-DD.MM.AAAA-NOMEDOPROJETO.png`.
- Nao recolocar downloads georreferenciados nesse botao. Se quiser world file, criar outro botao separado e explicar para o usuario.

## Possiveis proximas melhorias

- Criar fixture DXF real em test-results ou fixtures/ para teste manual.
- Separar parser DXF para arquivo proprio e testar com unit tests.
- Suportar INSERT/BLOCK via expansao simples de blocos.
- Suportar bulge em LWPOLYLINE.
- Suportar SPLINE por aproximacao.
- Melhorar feedback de CRS no DXF: mostrar zona/hemisferio assumidos antes de importar.
- Criar preview de layers importadas com contagem e nomes de layers.
- Se o app crescer, adicionar Playwright para fluxo Demo > PNG 4K > um download.

## Resposta padrao para retomada

Quando o Hil perguntar "onde paramos", responder:

Estamos no NXGEO em /Users/hil/NXPROJETOS/NX/apps/nxgeo. Ja foram feitos filtros de mapa, controle de ajuste oculto, export PNG 4K unico e importador DXF basico. O app principal esta em src/App.tsx. Para validar: npm run build e npm run lint.
