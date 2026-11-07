import { openDb } from './db.js'
import { createContext, purgeSessions } from './util.js'
import { createApp } from './app.js'

// DB_PATH를 주면 그 파일을, 아니면 backend/data/app.db를 연다.
const db = openDb(process.env.DB_PATH)
const domain = createContext(db)
const app = createApp(domain)

// 만료된 세션은 접근할 때 지워지지만, 다시 쓰이지 않는 세션이 쌓이지 않도록 주기적으로 정리한다.
const sweep = setInterval(() => purgeSessions(domain), 60 * 60 * 1000)
sweep.unref()

const port = Number(process.env.PORT ?? 3000)
const server = app.listen(port, () => {
    console.log(`listening on http://localhost:${port}`)
})

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
        server.close(() => {
            db.close()
            process.exit(0)
        })
    })
}
