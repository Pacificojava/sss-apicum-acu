import express from 'express';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const port = process.env.PORT || 8080;

// Middleware para parse de JSON
app.use(express.json());

// Define a raiz do projeto
const projectRoot = path.resolve(__dirname, '../../');

app.use(express.static(projectRoot));
app.use('/public', express.static(path.join(projectRoot, 'public')));

app.get('/', (_req: Request, res: Response) => {
  res.sendFile(path.join(projectRoot, 'index.html'));
});

app.get('/index.html', (_req: Request, res: Response) => {
  res.sendFile(path.join(projectRoot, 'index.html'));
});

// Opcional: rota para garantir acesso direto ao index.html
app.get('/index.html', (_req: Request, res: Response) => {
  res.sendFile(path.join(projectRoot, 'index.html'));
});

app.listen(Number(port), '0.0.0.0', () => {
  console.log(`Servidor a correr na porta ${port}`);
});

export default app;