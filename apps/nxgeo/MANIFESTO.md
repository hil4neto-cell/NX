# MANIFESTO - NXGEO

NXGEO existe para transformar planta tecnica em leitura cartografica clara.

O app nao deve tentar parecer um GIS completo logo de cara. Ele deve fazer bem o fluxo principal: importar uma planta ou geometria, colocar no mapa real, permitir ajuste controlado e exportar uma imagem ou arquivo confiavel para conversa tecnica com cliente, obra, regularizacao ou territorio.

## Principio central

A primeira tela deve mostrar o projeto, nao a ferramenta.

Marcadores, cantos, envelopes e controles sao instrumentos de ajuste. Eles nao podem roubar a atencao da area real. O cliente quer ver o terreno, o loteamento, a area e o encaixe no mapa. Depois, se precisar, ele liga os controles.

## Regras de experiencia

- Mostrar a demarcacao original/importada do projeto como leitura principal.
- Deixar controle de ajuste oculto por padrao.
- Permitir revelar controle quando o usuario quiser ajustar.
- Permitir ocultar e revelar camadas sem destruir dados.
- Permitir trocar cor sem perder o sentido tecnico.
- Evitar laranja forte como padrao visual, porque parece erro, alerta ou marcacao invasiva.
- Nomear botoes pelo que eles realmente fazem.
- Abrir NXGEO significa abrir estudo interno JSON do app.
- Salvar NXGEO significa salvar estudo interno JSON do app.
- Importar KML/KMZ, Importar PDNEZ e Importar DXF significam importar dados externos.
- PNG 4K significa baixar uma imagem PNG 4K, um unico arquivo, em um clique.

## Regras tecnicas

- Dado importado nao deve ser descartado quando o usuario so muda filtro visual.
- Filtro visual muda visibilidade/cor, nao geometria.
- Exportacao deve respeitar o que o usuario esta vendo, principalmente no PNG 4K.
- Importacao deve centralizar o mapa nos dados importados.
- Se um formato externo for ambiguo, o app deve usar padrao visivel no painel e avisar no status.
- Para DXF sem CRS declarado, assumir UTM pela zona e hemisferio escolhidos no painel.
- Para UTM, manter padrao inicial zona 23, hemisferio Sul, porque e a regiao usada no exemplo atual.

## O que nao fazer

- Nao mostrar cantos de controle como se fossem a area final.
- Nao voltar a cor laranja forte como padrao inicial.
- Nao chamar JSON interno de importacao generica.
- Nao fazer o usuario clicar varias vezes para exportar 4K.
- Nao disparar varios downloads no botao 4K.
- Nao esconder erro de importacao com status generico demais.
- Nao prometer suporte completo a CAD complexo enquanto o parser DXF for simples.

## Norte de evolucao

O caminho natural e separar o app em modulos quando a pressao crescer:

- parsers de KML/KMZ, PDNEZ e DXF;
- conversores de coordenadas;
- camada de mapa;
- exportadores;
- componentes de painel.

Mas enquanto a demanda for urgente de cliente, mexer pequeno, validar e preservar o fluxo existente. Refatoracao bonita nao pode quebrar mapa em dia de entrega.
