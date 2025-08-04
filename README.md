# WhatsApp Chatbot + Typebot + GestãoDS

Um chatbot inteligente para WhatsApp que integra com Typebot e sistema GestãoDS para automação de vendas e atendimento ao cliente.

## 🚀 Funcionalidades

- **Integração com Z-API**: Recebe e envia mensagens via WhatsApp
- **Typebot Integration**: Chatbot inteligente com fluxos conversacionais
- **GestãoDS CRM**: Gerenciamento de leads e oportunidades
- **Memory Store**: Gerenciamento de estado das conversas
- **Webhook**: Endpoint para receber mensagens do Z-API

## 📁 Estrutura do Projeto

```
whatsapp-chatbot/
├── index.js                 # Servidor principal
├── controllers/
│   └── messageController.js # Controlador de mensagens
├── services/
│   ├── typebotService.js    # Integração com Typebot
│   ├── zapiService.js       # Integração com Z-API
│   └── gestaodsService.js   # Integração com GestãoDS
├── utils/
│   └── memoryStore.js       # Gerenciamento de estado
├── .env                     # Variáveis de ambiente
├── package.json
└── README.md
```

## 🛠️ Instalação

1. **Clone o repositório**
   ```bash
   git clone <repository-url>
   cd whatsapp-chatbot
   ```

2. **Instale as dependências**
   ```bash
   npm install
   ```

3. **Configure as variáveis de ambiente**
   ```bash
   cp env.example .env
   ```
   
   Edite o arquivo `.env` com suas credenciais:
   ```env
   PORT=3000
   ZAPI_API_KEY=your_zapi_api_key
   ZAPI_INSTANCE_ID=your_instance_id
   TYPEBOT_API_KEY=your_typebot_api_key
   GESTAODS_API_KEY=your_gestaods_api_key
   ```

4. **Execute o servidor**
   ```bash
   npm start
   ```

## 🔧 Configuração

### Z-API Setup
1. Crie uma conta no [Z-API](https://z-api.io)
2. Crie uma instância do WhatsApp
3. Obtenha sua API Key e Instance ID
4. Configure o webhook para: `https://seu-dominio.com/webhook`

### Typebot Setup
1. Crie uma conta no [Typebot](https://typebot.io)
2. Crie seu chatbot com os fluxos desejados
3. Obtenha sua API Key
4. Configure as variáveis de ambiente

### GestãoDS Setup
1. Configure sua conta no GestãoDS
2. Obtenha sua API Key e Company ID
3. Configure as variáveis de ambiente

## 📡 API Endpoints

### POST /webhook
Recebe mensagens do Z-API

**Body:**
```json
{
  "message": "Olá, como posso ajudar?",
  "phone": "5511999999999",
  "name": "João Silva"
}
```

**Response:**
```json
{
  "success": true
}
```

## 🔄 Fluxo de Funcionamento

1. **Recebimento**: Z-API envia mensagem para `/webhook`
2. **Processamento**: `messageController` processa a mensagem
3. **Typebot**: Integração com chatbot inteligente
4. **GestãoDS**: Criação/atualização de leads
5. **Resposta**: Envio da resposta via Z-API
6. **Memória**: Armazenamento do estado da conversa

## 🧠 Memory Store

O sistema mantém em memória:
- **Sessões**: Estado das conversas ativas
- **Dados do usuário**: Informações coletadas
- **Histórico**: Últimas mensagens trocadas

### Limpeza Automática
- Sessões antigas (>24h) são removidas automaticamente
- Histórico limitado a 50 mensagens por usuário

## 📊 Monitoramento

### Logs
- ✅ Mensagens enviadas com sucesso
- ❌ Erros de integração
- 📨 Mensagens recebidas
- 🗑️ Sessões removidas

### Estatísticas
```javascript
const stats = memoryStore.getStats();
console.log(stats);
// { activeSessions: 5, userDataEntries: 10, conversationHistories: 8 }
```

## 🚨 Tratamento de Erros

O sistema inclui tratamento robusto de erros:
- Validação de dados de entrada
- Retry automático para APIs externas
- Logs detalhados para debugging
- Fallbacks para falhas de integração

## 🔒 Segurança

- Validação de tokens de API
- Sanitização de dados de entrada
- Rate limiting (recomendado)
- HTTPS obrigatório em produção

## 🚀 Deploy

### Heroku
```bash
heroku create seu-app-name
heroku config:set NODE_ENV=production
git push heroku main
```

### Vercel
```bash
vercel --prod
```

### Docker
```dockerfile
FROM node:16-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

## 🤝 Contribuição

1. Fork o projeto
2. Crie uma branch para sua feature
3. Commit suas mudanças
4. Push para a branch
5. Abra um Pull Request

## 📝 Licença

Este projeto está sob a licença MIT. Veja o arquivo `LICENSE` para mais detalhes.

## 📞 Suporte

Para suporte, entre em contato:
- Email: suporte@exemplo.com
- WhatsApp: +55 11 99999-9999

---

**Desenvolvido com ❤️ para automação de vendas** 