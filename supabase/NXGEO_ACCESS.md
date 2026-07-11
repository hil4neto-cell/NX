# NXGEO: acesso, equipe e workspace

O NXGEO usa o Supabase Auth para login sem senha por código único de oito dígitos e o Postgres para decidir, em tempo real, quais dados cada pessoa pode acessar.

Papéis:

- `admin`: administra a equipe e enxerga todas as pastas, mapas e arquivos;
- `user`: enxerga e altera somente os mapas das pastas atribuídas a ele.

O administrador inicial é `marcelo.topografia@gmail.com`. A migration garante que ele permaneça ativo como `admin` na instalação inicial.

## 1. Aplicar as migrations

As migrations devem ser executadas nesta ordem:

1. `migrations/20260711170000_nxgeo_email_allowlist.sql`;
2. `migrations/20260711190000_nxgeo_workspace.sql`.
3. `migrations/20260711213000_nxgeo_archive_actions.sql`.

A segunda migration é compatível com a allowlist anterior: migra os e-mails existentes para `nxgeo_members`, substitui a verificação do Auth Hook e mantém a tabela antiga sincronizada durante a transição.

Depois dela, não administre acessos editando `nxgeo_allowed_emails`. Use o painel NXGEO ou as RPCs administrativas.

## 2. Configurar o Supabase Auth

Em **Authentication > Sign In / Providers**:

- mantenha o provedor de e-mail habilitado;
- mantenha **Allow new users to sign up** ligado;
- mantenha login anônimo desligado;
- mantenha confirmação de e-mail ligada.

Em **Authentication > URL Configuration**:

- Site URL: `https://nxprojetos.com/nxgeo`;
- Redirect URL permitida: `https://nxprojetos.com/nxgeo`.

Em **Authentication > Emails > Templates > Magic Link**:

- assunto sugerido: `Seu código de acesso ao NXGEO` (não coloque o código no assunto);
- no corpo, use `{{ .Token }}` para exibir o código de oito dígitos;
- **não** use `{{ .ConfirmationURL }}` nesse template, pois ela cria um link que abre no navegador padrão;
- mantenha o prazo padrão de expiração do código, salvo uma decisão de segurança posterior.

O app confirma esse código na própria tela. Não há senha inicial para criar: é mais simples para a pessoa convidada e a sessão continua no dispositivo depois da primeira confirmação.

Em **Authentication > Auth Hooks > Before User Created**:

1. selecione **Postgres Function**;
2. escolha `public.nxgeo_before_user_created`;
3. ative e salve.

O hook bloqueia no servidor qualquer criação de usuário cujo e-mail não esteja ativo em `nxgeo_members`.

## 3. Publicar a Edge Function de convite

O código está em `functions/nxgeo-invite/index.ts`.

Configure somente valores não sensíveis pelo CLI:

```bash
supabase secrets set \
  NXGEO_ALLOWED_ORIGINS="https://nxprojetos.com,http://localhost:5173"
```

Depois publique:

```bash
supabase functions deploy nxgeo-invite
```

O ambiente hospedado do Supabase fornece automaticamente `SUPABASE_URL` e o dicionário `SUPABASE_PUBLISHABLE_KEYS`. Não é necessário copiar chave secreta para o código ou para o frontend; esta função não usa chave administrativa.

Para execução local, use um arquivo `.env.local` ignorado pelo Git e passe-o com `supabase functions serve --env-file .env.local`. Nunca grave segredo no React, no Git ou no corpo da requisição.

A função aplica quatro verificações:

1. aceita somente origens configuradas;
2. valida a sessão pelo Supabase Auth;
3. chama `nxgeo_admin_invite_member` com a sessão do usuário, portanto a RLS/RPC confirma que ele é admin;
4. solicita ao Supabase um código único somente depois da autorização estar gravada.

Para uma pessoa nova ou já existente, a função envia o mesmo código de oito dígitos. Se o envio falhar, a autorização permanece pendente e a interface pode oferecer **Reenviar convite**.

Exemplo no frontend:

```ts
const { data, error } = await supabase.functions.invoke('nxgeo-invite', {
  body: {
    email: 'pessoa@empresa.com',
    full_name: 'Nome da pessoa',
  },
})
```

Todo convite novo nasce como `user`. Depois que a Edge Function confirma o envio, o painel chama as RPCs administrativas para promover a pessoa a `admin` ou atribuir as pastas escolhidas. Assim o envio do e-mail e a autorização continuam protegidos no servidor, mesmo com a escolha simples de papel na interface.

## 4. Contrato das RPCs

### Pessoa da sessão

```ts
const { data: member } = await supabase.rpc('nxgeo_current_member')
```

Retorna um objeto com `id`, `email`, `full_name`, `role`, `active`, `joined_at` e `last_seen_at`. Use `full_name` para a saudação, com o e-mail como fallback.

### Listar equipe — somente admin

```ts
const { data: members } = await supabase.rpc('nxgeo_admin_list_members')
```

Cada item inclui `folder_ids`, permitindo montar a tela de permissões sem consultas administrativas adicionais.

### Convidar — somente admin

Normalmente use a Edge Function, pois ela também envia o e-mail. A RPC interna é:

```ts
await supabase.rpc('nxgeo_admin_invite_member', {
  p_email: 'pessoa@empresa.com',
  p_full_name: 'Nome da pessoa',
})
```

### Alterar nome, papel ou status — somente admin

Envie `null` nos campos que não devem ser alterados:

```ts
await supabase.rpc('nxgeo_admin_update_member', {
  p_member_id: memberId,
  p_full_name: null,
  p_role: 'admin',
  p_active: null,
})
```

A RPC usa lock transacional e impede demover ou desativar o último administrador ativo, inclusive quando duas alterações acontecem ao mesmo tempo.

Para bloquear acesso:

```ts
await supabase.rpc('nxgeo_admin_update_member', {
  p_member_id: memberId,
  p_full_name: null,
  p_role: null,
  p_active: false,
})
```

### Substituir as pastas de um usuário — somente admin

```ts
await supabase.rpc('nxgeo_admin_set_member_folders', {
  p_member_id: memberId,
  p_folder_ids: [folderIdA, folderIdB],
})
```

A lista substitui todas as atribuições anteriores. Use `[]` para remover todas.

## 5. Pastas e mapas

Administradores criam e renomeiam pastas diretamente em `nxgeo_folders`. O banco preenche automaticamente autoria e datas.

```ts
await supabase
  .from('nxgeo_folders')
  .insert({
    name: 'Cliente — Projeto',
    description: 'Levantamentos e imagens deste trabalho',
  })
  .select()
  .single()
```

`description` é opcional e aceita até 500 caracteres.

Usuários não criam nem renomeiam pastas. Eles podem criar, abrir e salvar mapas nas pastas atribuídas; podem arquivar somente os mapas que criaram. Administradores criam, compartilham e arquivam pastas, podem mover mapas entre pastas e enxergam tudo.

As pastas representam clientes ou projetos compartilhados do espaço de trabalho. Um usuário não recebe uma árvore privada automática: o administrador escolhe exatamente quais pastas compartilhar, evitando duplicidade e confusão para o cliente.

```ts
const mapId = crypto.randomUUID()

await supabase
  .from('nxgeo_maps')
  .insert({
    id: mapId,
    folder_id: folderId,
    name: 'Levantamento principal',
    state: mapState,
  })
  .select()
  .single()
```

O campo `state` guarda o estado serializável do editor, sem imagens em base64. Use `project_path` para o arquivo principal no Storage, `thumbnail_path` para a miniatura e `export_path` para o PNG pronto.

O frontend gera o UUID antes do insert para conhecer os paths futuros. A linha de `nxgeo_maps` precisa existir antes do primeiro upload, pois a política do Storage consulta esse registro para validar a pasta e o usuário.

“Excluir” no produto é **arquivar**: sai da lista ativa, mas preserva arquivos e auditoria para uma futura restauração. Use as RPCs, nunca uma atualização direta do navegador:

```ts
await supabase.rpc('nxgeo_archive_map', { p_map_id: mapId })
```

Para arquivar uma pasta (somente admin), incluindo seus mapas ativos:

```ts
await supabase.rpc('nxgeo_admin_archive_folder', { p_folder_id: folderId })
```

Para reorganizar um mapa entre projetos (somente admin):

```ts
await supabase.rpc('nxgeo_admin_move_map', {
  p_map_id: mapId,
  p_destination_folder_id: folderId,
})
```

O trigger incrementa `revision` quando nome, pasta, estado, arquivo principal ou status de arquivamento mudam. Quando um novo `export_path` é registrado, o banco grava `export_revision = revision`.

No painel de pastas:

- se `export_path` existir e `export_revision === revision`, mostre **Baixar imagem**;
- se `export_revision < revision`, sinalize discretamente **Imagem anterior**;
- se não existir exportação, mostre **Abrir para gerar imagem**.

## 6. Storage privado

O bucket `nxgeo-workspace` é criado como privado, com limite de 50 MB por arquivo e MIME types restritos a JSON, PNG, JPEG e WebP.

Todo objeto deve começar pelo ID do mapa:

```text
{map_id}/project/state.json
{map_id}/thumbnail/latest.webp
{map_id}/exports/{revision}.png
```

Exemplo:

```ts
const exportPath = `${map.id}/exports/${map.revision}.png`

await supabase.storage
  .from('nxgeo-workspace')
  .upload(exportPath, pngBlob, {
    contentType: 'image/png',
    upsert: false,
  })

await supabase
  .from('nxgeo_maps')
  .update({ export_path: exportPath })
  .eq('id', map.id)
```

Use `download()` ou uma URL assinada curta para baixar. Não transforme o bucket em público.

A política de `storage.objects` localiza o mapa pelo primeiro segmento do path e reaplica a permissão da pasta. Assim, conhecer uma URL ou um UUID não concede acesso ao arquivo.

## 7. Auditoria e segurança

`nxgeo_audit_log` registra:

- criação, atualização e arquivamento de pastas;
- criação, salvamento, exportação e arquivamento de mapas;
- movimentação de mapas entre pastas;
- convites, mudança de papel/status e atribuição de pastas.

Somente admins podem ler esse log. O conteúdo completo de `state` não é copiado para a auditoria.

As funções `security definer` usam `search_path = ''`, possuem permissões explícitas e consultam o papel no banco em cada operação. Não adicione o schema `private` à lista de schemas expostos pela Data API.

Desativar um usuário ou remover uma pasta atribuída passa a valer na consulta seguinte, sem depender da expiração do JWT.
