import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'
import { env } from './config/env.js'
import routes from './routes/index.js'
import { errorHandler } from './middleware/errorHandler.js'

const app = express()

app.use(helmet())
app.use(cors({ origin: env.clientUrl, credentials: true }))
app.use(express.json())
app.use(cookieParser())

app.use('/api/v1', routes)

app.use(errorHandler)

export default app
