# PsyCare

O PsyCare é uma aplicação web para gestão de clínicas de psicologia. A plataforma centraliza a rotina administrativa e clínica em um único sistema, com controle de acesso por perfil e organização dos dados por clínica.

## O que a aplicação faz

- Autentica usuários pelo Firebase Authentication.
- Controla acesso por clínica e por função (`admin`, `psychologist` e `receptionist`).
- Cadastra e gerencia profissionais, membros da equipe e pacientes.
- Agenda consultas com calendário, horários e controle de reservas.
- Mantém prontuários, avaliações psicológicas e diagnósticos CID-10.
- Cria documentos psicológicos estruturados, como declarações, atestados, relatórios, laudos, pareceres e encaminhamentos.
- Permite revisar, versionar e auditar documentos clínicos.
- Permite assinar documentos e recibos com assinatura desenhada na aplicação.
- Também permite gerar uma cópia do PDF sem assinatura para assinatura externa, como Gov.br ou ICP-Brasil.
- Controla cobranças, pagamentos, histórico de alterações e emissão de recibos.
- Exibe no dashboard indicadores e os pacientes agendados para a equipe administrativa.

> A assinatura desenhada é uma assinatura eletrônica registrada pela aplicação. A integração com Gov.br/ITI ou ICP-Brasil ainda é uma evolução futura e não é realizada automaticamente pelo sistema.

## Tecnologias utilizadas

- Angular 21 com componentes standalone.
- TypeScript 5.9.
- Firebase Authentication para autenticação.
- Cloud Firestore para dados, regras de segurança e auditoria.
- Firebase Hosting para publicação do frontend.
- Firebase Storage configurado para futuras necessidades de arquivos; as assinaturas desenhadas atuais são armazenadas como dados do documento no Firestore.
- PrimeNG e PrimeIcons para componentes e ícones.
- Bootstrap 5 para estilos auxiliares.
- FullCalendar para agenda e consultas.
- jsPDF para geração de documentos e recibos em PDF.
- SCSS para estilização.
- RxJS e Temporal Polyfill para suporte à aplicação.
- ESLint e Prettier para qualidade e padronização do código.
- Vitest para testes unitários via Angular CLI.

## Estrutura de pastas

```text
psycare/
├── public/
│   ├── data/
│   │   └── cid10.json                 # Base local de códigos CID-10
│   ├── favicon.ico
│   └── psycare-favicon.svg
│
├── src/
│   ├── app/
│   │   ├── core/
│   │   │   ├── auth/                  # Autenticação, sessão e guards
│   │   │   ├── firebase/              # Inicialização e configuração do Firebase
│   │   │   ├── models/                 # Modelos compartilhados da aplicação
│   │   │   └── services/               # Acesso ao Firestore e serviços de domínio
│   │   │
│   │   ├── features/
│   │   │   ├── auth/login/             # Tela de login
│   │   │   ├── dashboard/              # Indicadores e agenda resumida
│   │   │   ├── patients/               # Cadastro de pacientes
│   │   │   ├── professionals/          # Cadastro de profissionais
│   │   │   ├── members/                # Usuários e membros da clínica
│   │   │   ├── appointments/           # Agenda de consultas
│   │   │   ├── clinical/               # Prontuários, avaliações e diagnósticos
│   │   │   ├── documents/              # Documentos psicológicos e assinaturas
│   │   │   └── financial/              # Cobranças, pagamentos e recibos
│   │   │
│   │   ├── layout/main-layout/         # Layout protegido da aplicação
│   │   ├── app.config.ts
│   │   ├── app.routes.ts
│   │   ├── app.html
│   │   └── app.ts
│   │
│   ├── environments/                  # Configurações locais (não versionadas)
│   ├── index.html
│   └── styles.scss                    # Estilos globais
│
├── firestore.rules                     # Regras de segurança do Firestore
├── storage.rules                       # Regras do Firebase Storage
├── firebase.json                       # Configuração do Firebase Hosting/Firestore
├── angular.json                        # Configuração do Angular CLI
├── package.json                        # Dependências e scripts
└── README.md
```

## Pré-requisitos

- Node.js compatível com Angular 21.
- npm 10 ou superior (o projeto declara `npm@10.9.4`).
- Uma configuração do Firebase para desenvolvimento.
- Firebase CLI apenas para publicar a aplicação ou fazer deploy das regras.

Confira as versões instaladas:

```bash
node --version
npm --version
```

Para instalar o Firebase CLI globalmente:

```bash
npm install -g firebase-tools
firebase login
```

## Configuração local do Firebase

O diretório `src/environments/` está no `.gitignore` porque pode conter configurações específicas do ambiente. Crie o arquivo `src/environments/environment.ts` localmente com as credenciais do aplicativo web do Firebase:

```ts
export const environment = {
  production: false,
  firebase: {
    apiKey: 'SUA_API_KEY',
    authDomain: 'SEU_PROJETO.firebaseapp.com',
    projectId: 'SEU_PROJETO',
    storageBucket: 'SEU_BUCKET',
    messagingSenderId: 'SEU_SENDER_ID',
    appId: 'SEU_APP_ID'
  }
};
```

Use os valores exibidos no console do Firebase. As regras do Firestore continuam sendo a camada responsável por autorizar ou negar operações; a configuração web do Firebase não substitui essas regras.

## Como executar localmente

Na pasta do projeto:

```bash
npm install
npm start
```

Depois, acesse:

```text
http://localhost:4200/
```

O Angular recompila a aplicação automaticamente quando os arquivos são alterados.

## Scripts disponíveis

```bash
npm start                  # Servidor de desenvolvimento
npm run build              # Build de produção
npm run build -- --configuration development
npm run lint               # Verificação do ESLint
npm run format             # Formata os arquivos com Prettier
npm run format:check       # Verifica a formatação
npm test                   # Executa os testes
```

## Deploy no Firebase

O projeto Firebase configurado é `psycare-ce0b9`. O Hosting utiliza a saída Angular `dist/psycare/browser` e possui rewrite para o `index.html`, necessário para as rotas do Angular.

Para publicar o frontend:

```bash
npm run build
firebase use psycare-ce0b9
firebase deploy --only hosting
```

Para publicar as regras do Firestore:

```bash
firebase deploy --only firestore:rules
```

Se as regras do Storage forem alteradas e o Storage estiver habilitado no projeto Firebase:

```bash
firebase deploy --only storage
```

## Perfis de acesso

- `admin`: administra a clínica, usuários, profissionais e dados permitidos pelas regras.
- `psychologist`: acessa os pacientes vinculados ao seu cadastro profissional e os registros clínicos autorizados.
- `receptionist`: atua nas rotinas administrativas, como pacientes, profissionais e agenda.

O acesso real é validado pelas regras do Firestore e pelos guards da aplicação. Portanto, alterar a interface não concede permissões adicionais ao usuário.

## Boas práticas

- Não versione arquivos de ambiente com credenciais específicas.
- Revise `firestore.rules` antes de cada deploy.
- Teste as regras com usuários de cada perfil.
- Execute `npm run lint` e `npm run format:check` antes de publicar.
- Faça backup dos dados antes de alterações estruturais no Firestore.
