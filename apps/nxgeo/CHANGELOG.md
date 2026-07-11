# CHANGELOG - NXGEO

Registro manual de mudancas importantes. Data base: 2026-07-09.

## 2026-07-11 - Aplicativo instalável

- NXGEO passou a ter manifest, ícones próprios e abertura em modo aplicativo no desktop e celular.
- Chrome oferece o botão Instalar aplicativo quando o navegador disponibiliza o prompt.
- iPhone recebe uma orientação direta para Safari > Compartilhar > Adicionar à Tela de Início.
- Adicionado cache somente da estrutura pública do app para abertura resiliente, sem guardar mapas, sessões ou arquivos privados do cliente.

## 2026-07-11 - Workspace de projetos e equipe

- Adicionado painel receptivo com saudacao, busca, pastas e mapas recentes.
- Marcelo (`marcelo.topografia@gmail.com`) definido como administrador inicial.
- Adicionados papeis simples `admin` e `user`, com protecao do ultimo administrador ativo.
- Administradores podem convidar pessoas, promover outros admins, bloquear acessos e atribuir pastas.
- Usuarios comuns enxergam somente as pastas compartilhadas com eles.
- Mapas agora podem ser salvos em Storage privado com estado, miniatura e ultimo PNG 4K.
- Adicionado download rapido da imagem salva sem precisar abrir o editor.
- Adicionados revisionamento contra sobrescrita, soft delete, auditoria e RLS em tabelas e arquivos.
- Editor passou a carregar sob demanda para deixar a abertura do painel mais leve.
- Tela de login revisada como plataforma de trabalho, com linguagem simples e visual sutil.

## 2026-07-11 - Integracao ao site e atribuicao cartografica

- Preparado build do NXGEO na rota `/nxgeo` do site institucional.
- Marca NX no aplicativo passou a voltar para o site principal.
- Adicionada atribuicao da base cartografica e dos rotulos no rodape do PNG 4K.
- Rota tecnica marcada como `noindex` para nao aparecer em mecanismos de busca.

## 2026-07-11 - Autenticacao com Supabase

- Adicionada tela de acesso restrito por link magico enviado ao e-mail.
- Adicionada allowlist SQL para autorizar, bloquear e reativar e-mails sem usar o painel de usuarios.
- Adicionado Auth Hook do Supabase para impedir no servidor o cadastro de e-mails fora da allowlist.
- A permissao e verificada novamente depois da autenticacao.
- Cadastro no Auth so ocorre depois da aprovacao da allowlist.
- Sessao fica persistida e e renovada automaticamente no navegador.
- Adicionado botao Sair ao painel do NXGEO.

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
