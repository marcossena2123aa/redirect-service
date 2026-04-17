# 🚀 Redirect Service — Google Cloud Run

Sistema de redirecionamento anti-bot para email marketing, rodando no Google Cloud Run.

---

## ✅ Pré-requisitos

1. Conta no [Google Cloud](https://console.cloud.google.com) (tem free tier generoso)
2. [Google Cloud CLI](https://cloud.google.com/sdk/docs/install) instalado
3. Docker instalado (só para build local — opcional)

---

## 🚀 Deploy em 4 comandos

Abra o terminal na pasta do projeto e execute:

```bash
# 1. Login no Google Cloud
gcloud auth login

# 2. Defina seu projeto (crie um em console.cloud.google.com se não tiver)
gcloud config set project SEU_PROJECT_ID

# 3. Deploy direto (Cloud Run faz o build automaticamente — sem Docker local!)
gcloud run deploy redirect-service \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars="SECRET_KEY=SuaChaveSuperSecreta123,BASE_URL=https://click.seudominio.com.br" \
  --port 8080

# 4. Anote a URL gerada (ex: https://redirect-service-abc123-uc.a.run.app)
```

> ☁️ O `--source .` faz o Google Cloud construir e publicar a imagem Docker automaticamente. Você não precisa do Docker instalado localmente.

---

## 🌐 Configurar domínio personalizado

Para usar `click.seudominio.com.br` ao invés da URL gerada pelo Cloud Run:

### No Cloud Run:
1. Acesse [Cloud Run no Console](https://console.cloud.google.com/run)
2. Clique no serviço `redirect-service`
3. Aba **Custom Domains** → **Add Mapping**
4. Adicione `click.seudominio.com.br`
5. O Google vai mostrar os registros DNS para configurar

### No seu provedor de DNS:
Adicione o registro CNAME mostrado pelo Google:
```
Tipo:  CNAME
Nome:  click
Valor: ghs.googlehosted.com
TTL:   3600
```

SSL é automático — o Google emite o certificado gratuitamente.

---

## 🔗 Adicionar/editar links

Edite o arquivo `links.json`:

```json
{
  "nome-do-link": {
    "url": "https://seusite.com.br/pagina",
    "label": "Descrição da campanha"
  }
}
```

Depois faça um novo deploy para aplicar:
```bash
gcloud run deploy redirect-service --source . --region us-central1
```

---

## 📧 Como usar nos emails

Nos seus emails, use sempre o formato:
```
https://click.seudominio.com.br/r/nome-do-link
```

Exemplos:
```
https://click.seudominio.com.br/r/vagas-ti
https://click.seudominio.com.br/r/cadastro
https://click.seudominio.com.br/r/newsletter
```

---

## 💰 Custo no Google Cloud

| O que | Quanto | Gratuito? |
|---|---|---|
| Primeiras 2 milhões de requisições/mês | — | ✅ Grátis |
| CPU enquanto o container está dormindo | 0 | ✅ Grátis |
| SSL / HTTPS | — | ✅ Grátis |
| Domínio personalizado | — | ✅ Grátis |
| Acima de 2M req/mês | $0,40 por 1M req | 💲 Pago |

Para uma empresa de RH com email marketing normal, o custo é **zero**.

---

## 🔧 Configurações do Cloud Run recomendadas

No Console → Cloud Run → redirect-service → Edit & Deploy:

```
Mínimo de instâncias: 0  (dorme quando não usa — economiza)
Máximo de instâncias: 5  (escala automático)
Memória:              256 MB (suficiente)
CPU:                  1
Timeout:              10 segundos
Concorrência:         80 req por instância
```

---

## 🔍 Ver logs em tempo real

```bash
gcloud run services logs tail redirect-service --region us-central1
```

Você verá algo como:
```
BOT | vagas-ti | Proofpoint/8.16.2...     ← scanner bloqueado
DESAFIO | vagas-ti                         ← humano recebeu challenge
CLIQUE | vagas-ti → https://seusite...     ← humano chegou ao destino
```

---

## ♻️ Atualizar após editar links.json

```bash
gcloud run deploy redirect-service --source . --region us-central1
```

O deploy leva ~2 minutos e é sem downtime (zero-downtime deploy).
