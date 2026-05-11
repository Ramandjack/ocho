# AGENTS — OCHO

Guía para agentes de IA (y humanos) que trabajan en **este paquete** (`ocho/`).

## Ubicación de reglas Cursor

Las reglas del proyecto para Cursor viven en `**ocho/.cursor/rules/ocho.mdc`** (relativo a la raíz del repo si `ocho/` es el proyecto, o como subcarpeta si el monorepo incluye más cosas).

## Qué es OCHO

**OCHO** es una plataforma SaaS modular orientada a gestión de proyectos, tareas, leads y extensiones por módulos, con autenticación de usuarios y panel de administración. Integra **NocoDB** como capa de datos y puede enlazar **automatizaciones** (p. ej. webhooks hacia n8n). Opera con dominio y API propios (`ocho.com.ar`, `api.ocho.com.ar`) y soporta contenido multiidioma en rutas estáticas (`en/`, `nl/`).

## Stack


| Capa               | Tecnología                                                    |
| ------------------ | ------------------------------------------------------------- |
| Runtime            | Node.js **>= 18**                                             |
| Servidor           | **Express 5** (ES modules, `**server.js`**)                   |
| Autenticación      | **JWT**, cookies (**cookie-parser**), **bcryptjs**            |
| Configuración      | **dotenv**, **cors**                                          |
| Datos              | API REST **NocoDB** (env)                                     |
| SPA                | **React** + **Vite** en `**client/`**, rutas bajo `**/app/**` |
| Marketing / legacy | HTML/CSS/JS en `**assets/**`, `**en/**`, `**nl/**`            |


## Desarrollo local

- **Solo API + estáticos**: `npm start` o `npm run dev:server` (puerto **3000** por defecto).
- **SPA con HMR + API** (dos terminales desde `ocho/`):
  1. `npm run dev:server`
  2. `npm run dev:client` (Vite en **5173**, proxy `**/api`** → 3000)
- URL típica de la SPA en dev: **[http://127.0.0.1:5173/app/login](http://127.0.0.1:5173/app/login)**
- Build del cliente: `**npm run build`** o `**npm run client:build**` (genera `client/dist/`; Express sirve la SPA si existe `client/dist/index.html`).

## Documentación

La carpeta `**docs/**` está reservada para documentación del producto o del repo (añadir archivos según necesidad).

## Objetivos

- Experiencia **segura y clara**; UI alineada con las reglas en `.cursor/rules/ocho.mdc`.
- **Estabilidad** en auth, CORS, cookies y NocoDB/n8n.
- **Variables de entorno** para secretos y URLs de integración; no commitear `.env`.

## Cómo debe trabajar el agente

1. Leer contexto en los archivos que se van a tocar; respetar ESM y patrones existentes.
2. Seguir `**ocho/.cursor/rules/ocho.mdc`**.
3. No commitear secretos; documentar envs sin valores reales.
4. Antes de tocar **varios archivos**, plan breve (qué, dónde, riesgos).
5. Difs acotados al pedido; sin refactors colaterales.
6. Tras cambios en auth/CORS/cookies, indicar pruebas manuales recomendadas.

## Convenciones rápidas

- Reglas Cursor adicionales: `ocho/.cursor/rules/*.mdc` con frontmatter válido (`description`, `alwaysApply` y/o `globs`).

# **Filosofía de arquitectura**

Prioridades:

1. Simplicidad

2. Escalabilidad

3. Reutilización

4. Seguridad

5. UX premium

Evitar:

- lógica duplicada

- componentes gigantes

- hardcodeo

- refactors innecesarios

- dependencias innecesarias

# **UI/UX**

La estética visual debe ser:

- minimalista

- premium

- profesional

- moderna

- tipo Stripe / Linear / Vercel

Preferencias:

- layouts limpios

- buen espaciado

- tipografía clara

- componentes reutilizables

- dark mode compatible

# **Metodología SaaS**

Siempre trabajar:

- pequeño

- estable

- probado

- incremental

Nunca hacer:

- cambios masivos sin validación

- migraciones completas de golpe

- refactors globales innecesario

# **Estructura futura**

## Roadmap técnico futuro

Módulos previstos:

- Admin Panel

- User Dashboard

- CRM

- Leads

- Ecommerce

- Billing

- AI Agents

- Automatizaciones

- Analytics

- Multi tenant

