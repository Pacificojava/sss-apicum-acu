import express, { NextFunction, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

import { all, get, initializeDatabase, run } from './database';

const app = express();
const PORT = Number(process.env.PORT) || 8080;
const JWT_SECRET = process.env.JWT_SECRET ?? 'sss-dev-secret-key-change-me';
const ALUNO_CARGOS = [
  'Pastor',
  'Professor(a)',
  'Porteiro',
  'Auxiliar Financeiro(a)',
  'Auxiliar da Sec. de Educação Cristã',
  'Secretário(a) Geral',
  'Tesoureiro(a)',
  'Mídia',
  'Membro',
  'Visitante',
  'Cordenador(a) de jovens',
  'Cordenador(a) de crianças',
  'Cordenador(a) de adolescentes',
  'Cordenador(a) de EBD',
];

app.use(express.json({ limit: '1mb' }));

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }

  next();
}); 

const projectRootCandidate = path.resolve(__dirname, '..');
const projectRoot = fs.existsSync(path.resolve(projectRootCandidate, 'index.html'))
  ? projectRootCandidate
  : path.resolve(projectRootCandidate, '..');

app.use('/public', express.static(path.resolve(projectRoot, 'public')));

app.get('/styles.css', (_req: Request, res: Response) => {
  res.sendFile(path.join(projectRoot, 'styles.css'));
});

app.get('/', (_req: Request, res: Response) => {
  res.sendFile(path.join(projectRoot, 'index.html'));
});

app.get('/index.html', (_req: Request, res: Response) => {
  res.sendFile(path.join(projectRoot, 'index.html'));
});

let databaseInitialization: Promise<void> | null = null;

function initializeDatabaseOnce(): Promise<void> {
  if (!databaseInitialization) {
    databaseInitialization = initializeDatabase().catch((error: unknown) => {
      databaseInitialization = null;
      throw error;
    });
  }

  return databaseInitialization;
}

app.use('/api', (_req: Request, _res: Response, next: NextFunction) => {
  initializeDatabaseOnce().then(() => next()).catch(next);
});

app.post('/api/auth/validar-contexto', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const chaveContexto = typeof req.body?.chave_contexto === 'string' ? req.body.chave_contexto.trim() : '';

    if (!chaveContexto) {
      return res.status(400).json({ error: 'A chave do contexto da igreja é obrigatória.' });
    }

    const igreja = await get<{ id: number; nome_institucao: string; chave_contexto: string; status: string }>(
      'SELECT id, nome_institucao, chave_contexto, status FROM igrejas WHERE chave_contexto = ? LIMIT 1',
      [chaveContexto],
    );

    if (!igreja) {
      return res.status(404).json({ error: 'Contexto da igreja não encontrado ou não autorizado.' });
    }

    if (igreja.status !== 'ativa') {
      return res.status(403).json({ error: 'Este contexto da igreja está inativo.' });
    }

    return res.json({
      valido: true,
      mensagem: 'Contexto validado com sucesso.',
      igreja: {
        id: igreja.id,
        nome_institucao: igreja.nome_institucao,
        chave_contexto: igreja.chave_contexto,
        status: igreja.status,
      },
    });
  } catch (error) {
    console.error('Erro ao validar contexto:', error);
    return next(error);
  }
});

app.post('/api/auth/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const chaveContexto = typeof req.body?.chave_contexto === 'string' ? req.body.chave_contexto.trim() : '';
    const login = typeof req.body?.login === 'string' ? req.body.login.trim() : '';
    const senha = typeof req.body?.senha === 'string' ? req.body.senha : '';

    if (!chaveContexto || !login || !senha) {
      return res.status(400).json({ error: 'Contexto, login e senha são obrigatórios.' });
    }

    const igreja = await get<{ id: number; nome_institucao: string; chave_contexto: string; status: string }>(
      'SELECT id, nome_institucao, chave_contexto, status FROM igrejas WHERE chave_contexto = ? LIMIT 1',
      [chaveContexto],
    );

    if (!igreja || igreja.status !== 'ativa') {
      return res.status(401).json({ error: 'Contexto da igreja inválido ou não autorizado.' });
    }

    const usuario = await get<{
      id: number;
      nome: string;
      login: string;
      senha_hash: string;
      nivel_perfil: string;
      id_igreja: number;
      id_congregacao: number | null;
    }>(
      'SELECT id, nome, login, senha_hash, nivel_perfil, id_igreja, id_congregacao FROM usuarios WHERE login = ? AND id_igreja = ? LIMIT 1',
      [login, igreja.id],
    );

    if (!usuario || !bcrypt.compareSync(senha, usuario.senha_hash)) {
      return res.status(401).json({ error: 'Credenciais inválidas para esse contexto da igreja.' });
    }

    const token = jwt.sign(
      {
        id_usuario: usuario.id,
        nivel_perfil: usuario.nivel_perfil,
        id_igreja: usuario.id_igreja,
        id_congregacao: usuario.id_congregacao ?? null,
        chave_contexto: igreja.chave_contexto,
      },
      JWT_SECRET,
      { expiresIn: '8h' },
    );

    return res.json({
      message: 'Login realizado com sucesso.',
      token,
      user: {
        id: usuario.id,
        nome: usuario.nome,
        login: usuario.login,
        nivel_perfil: usuario.nivel_perfil,
        id_igreja: usuario.id_igreja,
        id_congregacao: usuario.id_congregacao ?? null,
      },
      igreja: {
        id: igreja.id,
        nome_institucao: igreja.nome_institucao,
        chave_contexto: igreja.chave_contexto,
      },
    });
  } catch (error) {
    console.error('Erro ao autenticar usuário:', error);
    return next(error);
  }
});

app.get('/api/usuarios', async (req: Request, res: Response) => {
  try {
    const idIgreja = Number(req.query.id_igreja ?? 1);
    const usuarios = await all<{ id: number; nome: string; login: string; nivel_perfil: string; id_igreja: number; id_congregacao: number | null }>(
      'SELECT id, nome, login, nivel_perfil, id_igreja, id_congregacao FROM usuarios WHERE id_igreja = ? ORDER BY nome ASC',
      [idIgreja],
    );

    res.json(usuarios);
  } catch (error) {
    console.error('Erro ao buscar usuários:', error);
    res.status(500).json({ error: 'Não foi possível listar os usuários.' });
  }
});

app.get('/api/classes', async (_req: Request, res: Response) => {
  try {
    const classes = await all<{ id: number; nome_classe: string }>(
      'SELECT id, nome_classe FROM classes ORDER BY nome_classe ASC',
    );

    res.json(classes);
  } catch (error) {
    console.error('Erro ao buscar classes:', error);
    res.status(500).json({ error: 'Não foi possível listar as classes.' });
  }
});

app.get('/api/agendas', async (_req: Request, res: Response) => {
  try {
    const agendas = await all<{
      id: number;
      titulo: string;
      descricao: string | null;
      data_evento: string;
      horario: string | null;
      local: string | null;
    }>(
      'SELECT id, titulo, descricao, data_evento, horario, local FROM agendas ORDER BY data_evento ASC, horario ASC',
    );

    res.json(agendas);
  } catch (error) {
    console.error('Erro ao buscar agendas:', error);
    res.status(500).json({ error: 'Não foi possível listar as agendas.' });
  }
});

app.get('/api/cargos', async (_req: Request, res: Response) => {
  try {
    const cargos = await all<{ id: number; nome: string; ativo: number }>(
      'SELECT id, nome, ativo FROM cargos ORDER BY nome ASC',
    );

    res.json(cargos.map((cargo) => ({ ...cargo, ativo: Number(cargo.ativo) === 1 })));
  } catch (error) {
    console.error('Erro ao buscar cargos:', error);
    res.status(500).json({ error: 'Não foi possível listar os cargos.' });
  }
});

app.post('/api/cargos', async (req: Request, res: Response) => {
  try {
    const nomeCargo = typeof req.body?.nome === 'string' ? req.body.nome.trim() : '';

    if (!nomeCargo) {
      return res.status(400).json({ error: 'O nome do cargo é obrigatório.' });
    }

    const existente = await get<{ id: number }>('SELECT id FROM cargos WHERE nome = ?', [nomeCargo]);
    if (existente) {
      return res.status(409).json({ error: 'Já existe um cargo com este nome.' });
    }

    const created = await run('INSERT INTO cargos (nome, ativo) VALUES (?, 1)', [nomeCargo]);
    const cargo = await get<{ id: number; nome: string; ativo: number }>('SELECT id, nome, ativo FROM cargos WHERE id = ?', [created.lastID]);

    return res.status(201).json({ message: 'Cargo cadastrado com sucesso.', cargo: cargo ? { ...cargo, ativo: Number(cargo.ativo) === 1 } : null });
  } catch (error) {
    console.error('Erro ao criar cargo:', error);
    return res.status(500).json({ error: 'Não foi possível cadastrar o cargo.' });
  }
});

app.put('/api/cargos/:id', async (req: Request, res: Response) => {
  try {
    const cargoId = Number(req.params.id);
    const nomeCargo = typeof req.body?.nome === 'string' ? req.body.nome.trim() : '';

    if (!Number.isInteger(cargoId) || cargoId <= 0) {
      return res.status(400).json({ error: 'ID do cargo inválido.' });
    }

    if (!nomeCargo) {
      return res.status(400).json({ error: 'O nome do cargo é obrigatório.' });
    }

    const cargoExiste = await get<{ id: number }>('SELECT id FROM cargos WHERE id = ?', [cargoId]);
    if (!cargoExiste) {
      return res.status(404).json({ error: 'Cargo não encontrado.' });
    }

    await run('UPDATE cargos SET nome = ? WHERE id = ?', [nomeCargo, cargoId]);

    return res.json({ message: 'Cargo atualizado com sucesso.', id: cargoId });
  } catch (error) {
    console.error('Erro ao atualizar cargo:', error);
    return res.status(500).json({ error: 'Não foi possível atualizar o cargo.' });
  }
});

app.delete('/api/cargos/:id', async (req: Request, res: Response) => {
  try {
    const cargoId = Number(req.params.id);

    if (!Number.isInteger(cargoId) || cargoId <= 0) {
      return res.status(400).json({ error: 'ID do cargo inválido.' });
    }

    const cargoExiste = await get<{ id: number }>('SELECT id FROM cargos WHERE id = ?', [cargoId]);
    if (!cargoExiste) {
      return res.status(404).json({ error: 'Cargo não encontrado.' });
    }

    await run('DELETE FROM cargos WHERE id = ?', [cargoId]);

    return res.json({ message: 'Cargo excluído com sucesso.', id: cargoId });
  } catch (error) {
    console.error('Erro ao excluir cargo:', error);
    return res.status(500).json({ error: 'Não foi possível excluir o cargo.' });
  }
});

app.post('/api/classes', async (req: Request, res: Response) => {
  try {
    const { nome_classe } = req.body ?? {};
    const nomeClasse = typeof nome_classe === 'string' ? nome_classe.trim() : '';

    if (!nomeClasse) {
      return res.status(400).json({ error: 'O nome da turma é obrigatório.' });
    }

    const existente = await get<{ id: number }>('SELECT id FROM classes WHERE nome_classe = ?', [nomeClasse]);
    if (existente) {
      return res.status(409).json({ error: 'Já existe uma turma com este nome.' });
    }

    const created = await run('INSERT INTO classes (nome_classe) VALUES (?)', [nomeClasse]);
    const turma = await get<{ id: number; nome_classe: string }>('SELECT id, nome_classe FROM classes WHERE id = ?', [created.lastID]);

    return res.status(201).json({
      message: 'Turma cadastrada com sucesso.',
      turma,
    });
  } catch (error) {
    console.error('Erro ao criar turma:', error);
    return res.status(500).json({ error: 'Não foi possível cadastrar a turma.' });
  }
});

app.post('/api/usuarios', async (req: Request, res: Response) => {
  try {
    const { nome, login, senha, nivel_perfil } = req.body ?? {};
    const nomeUsuario = typeof nome === 'string' ? nome.trim() : '';
    const loginUsuario = typeof login === 'string' ? login.trim() : '';
    const senhaUsuario = typeof senha === 'string' ? senha.trim() : '';
    const nivelPerfil = typeof nivel_perfil === 'string' ? nivel_perfil.trim() : '';

    if (!nomeUsuario || !loginUsuario || !senhaUsuario) {
      return res.status(400).json({ error: 'Nome, login e senha são obrigatórios.' });
    }

    if (!['secretaria_geral', 'auxiliar_secretaria'].includes(nivelPerfil)) {
      return res.status(400).json({ error: 'Perfil do usuário inválido.' });
    }

    const existente = await get<{ id: number }>('SELECT id FROM usuarios WHERE login = ?', [loginUsuario]);
    if (existente) {
      return res.status(409).json({ error: 'Já existe um usuário com este login.' });
    }

    const senhaHash = bcrypt.hashSync(senhaUsuario, 10);
    const idIgreja = Number(req.body?.id_igreja ?? 1);
    const idCongregacao = Number(req.body?.id_congregacao ?? 1);

    const created = await run(
      'INSERT INTO usuarios (nome, login, senha_hash, nivel_perfil, id_igreja, id_congregacao) VALUES (?, ?, ?, ?, ?, ?)',
      [nomeUsuario, loginUsuario, senhaHash, nivelPerfil, idIgreja, idCongregacao],
    );

    const usuario = await get<{ id: number; nome: string; login: string; nivel_perfil: string }>(
      'SELECT id, nome, login, nivel_perfil FROM usuarios WHERE id = ?',
      [created.lastID],
    );

    return res.status(201).json({
      message: 'Usuário cadastrado com sucesso.',
      usuario,
    });
  } catch (error) {
    console.error('Erro ao criar usuário:', error);
    return res.status(500).json({ error: 'Não foi possível cadastrar o usuário.' });
  }
});

app.post('/api/agendas', async (req: Request, res: Response) => {
  try {
    const { titulo, descricao, data_evento, horario, local } = req.body ?? {};
    const tituloAgenda = typeof titulo === 'string' ? titulo.trim() : '';
    const descricaoAgenda = typeof descricao === 'string' ? descricao.trim() : '';
    const dataEvento = typeof data_evento === 'string' ? data_evento.trim() : '';
    const horarioAgenda = typeof horario === 'string' ? horario.trim() : '';
    const localAgenda = typeof local === 'string' ? local.trim() : '';

    if (!tituloAgenda || !dataEvento) {
      return res.status(400).json({ error: 'Título e data da agenda são obrigatórios.' });
    }

    const created = await run(
      'INSERT INTO agendas (titulo, descricao, data_evento, horario, local) VALUES (?, ?, ?, ?, ?)',
      [tituloAgenda, descricaoAgenda, dataEvento, horarioAgenda, localAgenda],
    );

    const agenda = await get<{
      id: number;
      titulo: string;
      descricao: string | null;
      data_evento: string;
      horario: string | null;
      local: string | null;
    }>('SELECT id, titulo, descricao, data_evento, horario, local FROM agendas WHERE id = ?', [created.lastID]);

    return res.status(201).json({
      message: 'Agenda cadastrada com sucesso.',
      agenda,
    });
  } catch (error) {
    console.error('Erro ao criar agenda:', error);
    return res.status(500).json({ error: 'Não foi possível cadastrar a agenda.' });
  }
});

app.put('/api/agendas/:id', async (req: Request, res: Response) => {
  try {
    const agendaId = Number(req.params.id);
    const { titulo, descricao, data_evento, horario, local } = req.body ?? {};

    if (!Number.isInteger(agendaId) || agendaId <= 0) {
      return res.status(400).json({ error: 'ID da agenda inválido.' });
    }

    const tituloAgenda = typeof titulo === 'string' ? titulo.trim() : '';
    const descricaoAgenda = typeof descricao === 'string' ? descricao.trim() : '';
    const dataEvento = typeof data_evento === 'string' ? data_evento.trim() : '';
    const horarioAgenda = typeof horario === 'string' ? horario.trim() : '';
    const localAgenda = typeof local === 'string' ? local.trim() : '';

    if (!tituloAgenda || !dataEvento) {
      return res.status(400).json({ error: 'Título e data da agenda são obrigatórios.' });
    }

    const agendaExiste = await get<{ id: number }>('SELECT id FROM agendas WHERE id = ?', [agendaId]);
    if (!agendaExiste) {
      return res.status(404).json({ error: 'Agenda não encontrada.' });
    }

    await run(
      'UPDATE agendas SET titulo = ?, descricao = ?, data_evento = ?, horario = ?, local = ? WHERE id = ?',
      [tituloAgenda, descricaoAgenda, dataEvento, horarioAgenda, localAgenda, agendaId],
    );

    return res.json({ message: 'Agenda atualizada com sucesso.', id: agendaId });
  } catch (error) {
    console.error('Erro ao atualizar agenda:', error);
    return res.status(500).json({ error: 'Não foi possível atualizar a agenda.' });
  }
});

app.delete('/api/agendas/:id', async (req: Request, res: Response) => {
  try {
    const agendaId = Number(req.params.id);

    if (!Number.isInteger(agendaId) || agendaId <= 0) {
      return res.status(400).json({ error: 'ID da agenda inválido.' });
    }

    const agendaExiste = await get<{ id: number }>('SELECT id FROM agendas WHERE id = ?', [agendaId]);
    if (!agendaExiste) {
      return res.status(404).json({ error: 'Agenda não encontrada.' });
    }

    await run('DELETE FROM agendas WHERE id = ?', [agendaId]);

    return res.json({ message: 'Agenda excluída com sucesso.', id: agendaId });
  } catch (error) {
    console.error('Erro ao excluir agenda:', error);
    return res.status(500).json({ error: 'Não foi possível excluir a agenda.' });
  }
});

app.post('/api/alunos', async (req: Request, res: Response) => {
  try {
    const { nome, idade, classe_id, cargo } = req.body ?? {};
    const nomeAluno = typeof nome === 'string' ? nome.trim() : '';
    const idadeAluno = Number(idade);
    const classeId = Number(classe_id);
    const cargoAluno = typeof cargo === 'string' ? cargo.trim() : 'Membro';

    if (!nomeAluno) {
      return res.status(400).json({ error: 'O nome do aluno é obrigatório.' });
    }

    if (!Number.isInteger(idadeAluno) || idadeAluno < 0) {
      return res.status(400).json({ error: 'A idade deve ser um número inteiro válido.' });
    }

    if (!Number.isInteger(classeId) || classeId <= 0) {
      return res.status(400).json({ error: 'A turma do aluno é obrigatória.' });
    }

    if (!ALUNO_CARGOS.includes(cargoAluno)) {
      return res.status(400).json({ error: 'Cargo inválido para o aluno.' });
    }

    const classeExiste = await get<{ id: number }>('SELECT id FROM classes WHERE id = ?', [classeId]);
    if (!classeExiste) {
      return res.status(404).json({ error: 'Classe não encontrada.' });
    }

    const created = await run('INSERT INTO alunos (nome, idade, cargo, classe_id) VALUES (?, ?, ?, ?)', [nomeAluno, idadeAluno, cargoAluno, classeId]);
    const aluno = await get<{ id: number; nome: string; idade: number; cargo: string; classe_id: number; classe_nome: string }>(
      `SELECT a.id, a.nome, a.idade, a.cargo, a.classe_id, c.nome_classe AS classe_nome
       FROM alunos a
       INNER JOIN classes c ON c.id = a.classe_id
       WHERE a.id = ?`,
      [created.lastID],
    );

    return res.status(201).json({
      message: 'Aluno cadastrado com sucesso.',
      aluno,
    });
  } catch (error) {
    console.error('Erro ao criar aluno:', error);
    return res.status(500).json({ error: 'Não foi possível cadastrar o aluno.' });
  }
});

app.get('/api/alunos', async (_req: Request, res: Response) => {
  try {
    const alunos = await all<{
      id: number;
      nome: string;
      idade: number;
      cargo: string;
      classe_id: number;
      classe_nome: string;
    }>(
      `SELECT a.id, a.nome, a.idade, a.cargo, a.classe_id, c.nome_classe AS classe_nome
       FROM alunos a
       INNER JOIN classes c ON c.id = a.classe_id
       ORDER BY a.nome ASC`,
    );

    res.json(alunos);
  } catch (error) {
    console.error('Erro ao buscar alunos:', error);
    res.status(500).json({ error: 'Não foi possível listar os alunos.' });
  }
});

app.put('/api/alunos/:id', async (req: Request, res: Response) => {
  try {
    const alunoId = Number(req.params.id);
    const { nome, idade, classe_id, cargo } = req.body ?? {};

    if (!Number.isInteger(alunoId) || alunoId <= 0) {
      return res.status(400).json({ error: 'ID do aluno inválido.' });
    }

    const nomeAluno = typeof nome === 'string' ? nome.trim() : '';
    const idadeAluno = Number(idade);
    const classeId = Number(classe_id);
    const cargoAluno = typeof cargo === 'string' ? cargo.trim() : 'Membro';

    if (!nomeAluno) {
      return res.status(400).json({ error: 'O nome do aluno é obrigatório.' });
    }

    if (!Number.isInteger(idadeAluno) || idadeAluno < 0) {
      return res.status(400).json({ error: 'A idade deve ser um número inteiro válido.' });
    }

    if (!Number.isInteger(classeId) || classeId <= 0) {
      return res.status(400).json({ error: 'A turma do aluno é obrigatória.' });
    }

    if (!ALUNO_CARGOS.includes(cargoAluno)) {
      return res.status(400).json({ error: 'Cargo inválido para o aluno.' });
    }

    const alunoExiste = await get<{ id: number }>('SELECT id FROM alunos WHERE id = ?', [alunoId]);
    const classeExiste = await get<{ id: number }>('SELECT id FROM classes WHERE id = ?', [classeId]);

    if (!alunoExiste) {
      return res.status(404).json({ error: 'Aluno não encontrado.' });
    }

    if (!classeExiste) {
      return res.status(404).json({ error: 'Classe não encontrada.' });
    }

    await run(
      'UPDATE alunos SET nome = ?, idade = ?, cargo = ?, classe_id = ? WHERE id = ?',
      [nomeAluno, idadeAluno, cargoAluno, classeId, alunoId],
    );

    return res.json({ message: 'Aluno atualizado com sucesso.', id: alunoId });
  } catch (error) {
    console.error('Erro ao atualizar aluno:', error);
    return res.status(500).json({ error: 'Não foi possível atualizar o aluno.' });
  }
});

app.delete('/api/alunos/:id', async (req: Request, res: Response) => {
  try {
    const alunoId = Number(req.params.id);

    if (!Number.isInteger(alunoId) || alunoId <= 0) {
      return res.status(400).json({ error: 'ID do aluno inválido.' });
    }

    const alunoExiste = await get<{ id: number }>('SELECT id FROM alunos WHERE id = ?', [alunoId]);

    if (!alunoExiste) {
      return res.status(404).json({ error: 'Aluno não encontrado.' });
    }

    await run('DELETE FROM alunos WHERE id = ?', [alunoId]);

    return res.json({ message: 'Aluno excluído com sucesso.', id: alunoId });
  } catch (error) {
    console.error('Erro ao excluir aluno:', error);
    return res.status(500).json({ error: 'Não foi possível excluir o aluno.' });
  }
});

app.post('/api/frequencias', async (req: Request, res: Response) => {
  try {
    const { aluno_id, classe_id, presente, data_aula } = req.body ?? {};

    const alunoId = Number(aluno_id);
    const classeId = Number(classe_id);
    const dataAula = typeof data_aula === 'string' ? data_aula.trim() : '';
    const presenteValido = presente === true || presente === false || presente === 1 || presente === 0 ||
      presente === '1' || presente === '0' || presente === 'true' || presente === 'false';
    const presenteValue = presente === true || presente === 1 || presente === '1' || presente === 'true';

    if (!Number.isInteger(alunoId) || alunoId <= 0) {
      return res.status(400).json({ error: 'O campo aluno_id é obrigatório e deve ser um número válido.' });
    }

    if (!Number.isInteger(classeId) || classeId <= 0) {
      return res.status(400).json({ error: 'O campo classe_id é obrigatório e deve ser um número válido.' });
    }

    if (!presenteValido) {
      return res.status(400).json({ error: 'Informe se o aluno esteve presente ou faltou.' });
    }

    const dataAulaDate = /^\d{4}-\d{2}-\d{2}$/.test(dataAula)
      ? new Date(`${dataAula}T00:00:00.000Z`)
      : null;

    if (!dataAulaDate || Number.isNaN(dataAulaDate.getTime()) || dataAulaDate.toISOString().slice(0, 10) !== dataAula) {
      return res.status(400).json({ error: 'Informe uma data válida para a aula.' });
    }

    if (dataAulaDate.getUTCDay() !== 0) {
      return res.status(400).json({ error: 'A frequência da EBD só pode ser registrada em domingos.' });
    }

    const alunoExiste = await get<{ id: number; classe_id: number }>('SELECT id, classe_id FROM alunos WHERE id = ?', [alunoId]);
    const classeExiste = await get<{ id: number }>('SELECT id FROM classes WHERE id = ?', [classeId]);

    if (!alunoExiste) {
      return res.status(404).json({ error: 'Aluno não encontrado.' });
    }

    if (!classeExiste) {
      return res.status(404).json({ error: 'Classe não encontrada.' });
    }

    if (Number(alunoExiste.classe_id) !== classeId) {
      return res.status(400).json({ error: 'A turma selecionada não corresponde à turma atual do aluno.' });
    }

    const registro = await run(
      `INSERT INTO frequencias (data_aula, aluno_id, classe_id, presente)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (data_aula, aluno_id, classe_id)
       DO UPDATE SET presente = EXCLUDED.presente`,
      [dataAula, alunoId, classeId, presenteValue ? 1 : 0],
    );

    const frequenciaCriada = await get<{
      id: number;
      data_aula: string;
      aluno_id: number;
      classe_id: number;
      presente: number;
    }>(
      `SELECT id, data_aula, aluno_id, classe_id, presente
       FROM frequencias
       WHERE id = ?`,
      [registro.lastID],
    );

    return res.status(200).json({
      message: 'Frequência do domingo salva com sucesso.',
      ...frequenciaCriada,
    });
  } catch (error) {
    console.error('Erro ao registrar frequência:', error);
    return res.status(500).json({ error: 'Não foi possível registrar a frequência no banco de dados.' });
  }
});

app.get('/api/dashboard/stats', async (_req: Request, res: Response) => {
  try {
    const totalAlunos = await get<{ total: number }>('SELECT COUNT(*) AS total FROM alunos');
    const totalClasses = await get<{ total: number }>('SELECT COUNT(*) AS total FROM classes');
    const totalFrequencias = await get<{ total: number }>(
      'SELECT COUNT(*) AS total FROM frequencias WHERE EXTRACT(DOW FROM data_aula) = 0',
    );
    const presencas = await get<{ total: number }>(
      'SELECT COUNT(*) AS total FROM frequencias WHERE presente = 1 AND EXTRACT(DOW FROM data_aula) = 0',
    );
    const faltas = await get<{ total: number }>(
      'SELECT COUNT(*) AS total FROM frequencias WHERE presente = 0 AND EXTRACT(DOW FROM data_aula) = 0',
    );

    const totalAlunosNumero = Number(totalAlunos?.total ?? 0);
    const totalClassesNumero = Number(totalClasses?.total ?? 0);
    const totalFrequenciasNumero = Number(totalFrequencias?.total ?? 0);
    const presencasNumero = Number(presencas?.total ?? 0);
    const faltasNumero = Number(faltas?.total ?? 0);
    const taxaPresenca = totalFrequenciasNumero > 0 ? Number(((presencasNumero / totalFrequenciasNumero) * 100).toFixed(2)) : 0;

    res.json({
      totalAlunos: totalAlunosNumero,
      totalClasses: totalClassesNumero,
      totalFrequencias: totalFrequenciasNumero,
      presencas: presencasNumero,
      faltas: faltasNumero,
      taxaPresenca,
    });
  } catch (error) {
    console.error('Erro ao obter estatísticas do dashboard:', error);
    res.status(500).json({ error: 'Não foi possível carregar as estatísticas do dashboard.' });
  }
});

async function getSundayAttendanceHistory(alunoId: number) {
  return all<{
    data_aula: string;
    presente: number;
    classe_nome: string;
  }>(
    `SELECT f.data_aula, f.presente, c.nome_classe AS classe_nome
     FROM frequencias f
     INNER JOIN classes c ON c.id = f.classe_id
     WHERE f.aluno_id = ?
       AND EXTRACT(DOW FROM f.data_aula) = 0
     ORDER BY f.data_aula DESC, f.id DESC`,
    [alunoId],
  );
}

app.get('/api/relatorios/aluno', async (req: Request, res: Response) => {
  try {
    const nomeConsulta = typeof req.query.nome === 'string' ? req.query.nome.trim() : '';

    if (!nomeConsulta) {
      return res.status(400).json({ error: 'Informe o nome do aluno para consultar o relatório.' });
    }

    const aluno = await get<{
      id: number;
      nome: string;
      classe_id: number;
      classe_nome: string;
    }>(
      `SELECT a.id, a.nome, a.classe_id, c.nome_classe AS classe_nome
       FROM alunos a
       INNER JOIN classes c ON c.id = a.classe_id
       WHERE LOWER(a.nome) LIKE LOWER(?)
       ORDER BY a.nome ASC
       LIMIT 1`,
      [`%${nomeConsulta}%`],
    );

    if (!aluno) {
      return res.status(404).json({ error: 'Aluno não encontrado para o filtro informado.' });
    }

    const historicoFrequencia = await getSundayAttendanceHistory(aluno.id);
    const totalAulasNumero = historicoFrequencia.length;
    const totalPresencasNumero = historicoFrequencia.filter((frequencia) => Number(frequencia.presente) === 1).length;
    const totalFaltasNumero = totalAulasNumero - totalPresencasNumero;
    const taxaFrequencia = totalAulasNumero > 0 ? Number(((totalPresencasNumero / totalAulasNumero) * 100).toFixed(2)) : 0;

    const status = taxaFrequencia >= 75 ? 'Frequência OK' : 'Risco de Evasão';

    return res.json({
      aluno,
      totalAulas: totalAulasNumero,
      totalPresencas: totalPresencasNumero,
      totalFaltas: totalFaltasNumero,
      faltasDatas: historicoFrequencia
        .filter((frequencia) => Number(frequencia.presente) === 0)
        .map(({ data_aula }) => data_aula),
      historicoFrequencia,
      taxaFrequencia,
      status,
    });
  } catch (error) {
    console.error('Erro ao gerar relatório do aluno:', error);
    return res.status(500).json({ error: 'Não foi possível gerar o relatório do aluno.' });
  }
});

app.get('/api/relatorios/aluno/:id', async (req: Request, res: Response) => {
  try {
    const alunoId = Number(req.params.id);

    if (!Number.isInteger(alunoId) || alunoId <= 0) {
      return res.status(400).json({ error: 'ID do aluno inválido.' });
    }

    const aluno = await get<{
      id: number;
      nome: string;
      classe_id: number;
      classe_nome: string;
    }>(
      `SELECT a.id, a.nome, a.classe_id, c.nome_classe AS classe_nome
       FROM alunos a
       INNER JOIN classes c ON c.id = a.classe_id
       WHERE a.id = ?`,
      [alunoId],
    );

    if (!aluno) {
      return res.status(404).json({ error: 'Aluno não encontrado.' });
    }

    const historicoFrequencia = await getSundayAttendanceHistory(alunoId);
    const totalAulasNumero = historicoFrequencia.length;
    const totalPresencasNumero = historicoFrequencia.filter((frequencia) => Number(frequencia.presente) === 1).length;
    const totalFaltasNumero = totalAulasNumero - totalPresencasNumero;
    const taxaFrequencia = totalAulasNumero > 0 ? Number(((totalPresencasNumero / totalAulasNumero) * 100).toFixed(2)) : 0;

    return res.json({
      aluno,
      totalAulas: totalAulasNumero,
      totalPresencas: totalPresencasNumero,
      totalFaltas: totalFaltasNumero,
      faltasDatas: historicoFrequencia
        .filter((frequencia) => Number(frequencia.presente) === 0)
        .map(({ data_aula }) => data_aula),
      historicoFrequencia,
      taxaFrequencia,
      status: taxaFrequencia >= 75 ? 'Frequência OK' : 'Risco de Evasão',
    });
  } catch (error) {
    console.error('Erro ao gerar relatório do aluno por ID:', error);
    return res.status(500).json({ error: 'Não foi possível gerar o relatório do aluno.' });
  }
});

app.get('/api/relatorios/classe/:classe_id', async (req: Request, res: Response) => {
  try {
    const classeId = Number(req.params.classe_id);

    if (!Number.isInteger(classeId) || classeId <= 0) {
      return res.status(400).json({ error: 'ID da turma inválido.' });
    }

    const classe = await get<{ id: number; nome_classe: string }>('SELECT id, nome_classe FROM classes WHERE id = ?', [classeId]);
    if (!classe) {
      return res.status(404).json({ error: 'Turma não encontrada.' });
    }

    const alunos = await all<{
      id: number;
      nome: string;
      total_aulas: number;
      presencas: number;
      faltas: number;
      frequencia: number;
      situacao: string;
    }>(
      `SELECT a.id,
              a.nome,
              COUNT(f.id) AS total_aulas,
              COALESCE(SUM(CASE WHEN f.presente = 1 THEN 1 ELSE 0 END), 0) AS presencas,
              COALESCE(SUM(CASE WHEN f.presente = 0 THEN 1 ELSE 0 END), 0) AS faltas,
              ROUND(COALESCE((SUM(CASE WHEN f.presente = 1 THEN 1 ELSE 0 END) * 100.0) / NULLIF(COUNT(f.id), 0), 0), 2) AS frequencia,
              CASE
                WHEN COALESCE((SUM(CASE WHEN f.presente = 1 THEN 1 ELSE 0 END) * 100.0) / NULLIF(COUNT(f.id), 0), 0) >= 75 THEN 'Regular'
                ELSE 'Atenção'
              END AS situacao
       FROM alunos a
       LEFT JOIN frequencias f ON f.aluno_id = a.id
       AND f.classe_id = ?
       AND EXTRACT(DOW FROM f.data_aula) = 0
       WHERE a.classe_id = ?
       GROUP BY a.id, a.nome
       ORDER BY a.nome ASC`,
      [classeId, classeId],
    );

    const totalAlunos = alunos.length;
    const mediaFrequencia = totalAlunos > 0
      ? Number((alunos.reduce((acc, aluno) => acc + Number(aluno.frequencia ?? 0), 0) / totalAlunos).toFixed(2))
      : 0;

    return res.json({
      classe,
      totalAlunos,
      mediaFrequencia,
      alunos,
    });
  } catch (error) {
    console.error('Erro ao gerar relatório da classe:', error);
    return res.status(500).json({ error: 'Não foi possível gerar o relatório da turma.' });
  }
});

app.get('/api/relatorios/geral', async (_req: Request, res: Response) => {
  try {
    const turmas = await all<{
      id: number;
      nome_classe: string;
      total_alunos: number;
      total_presencas: number;
      media_presenca: number;
    }>(
      `SELECT c.id,
              c.nome_classe,
              COUNT(DISTINCT a.id) AS total_alunos,
              COALESCE(SUM(CASE WHEN f.presente = 1 THEN 1 ELSE 0 END), 0) AS total_presencas,
              ROUND(COALESCE((SUM(CASE WHEN f.presente = 1 THEN 1 ELSE 0 END) * 100.0) / NULLIF(COUNT(f.id), 0), 0), 2) AS media_presenca
       FROM classes c
       LEFT JOIN alunos a ON a.classe_id = c.id
       LEFT JOIN frequencias f ON f.aluno_id = a.id
       AND f.classe_id = c.id
       AND EXTRACT(DOW FROM f.data_aula) = 0
       GROUP BY c.id, c.nome_classe
       ORDER BY c.nome_classe ASC`,
    );

    const alunos = await all<{
      id: number;
      nome: string;
      classe_nome: string;
      total_aulas: number;
      presencas: number;
      faltas: number;
      frequencia: number;
      situacao: string;
    }>(
      `SELECT a.id,
              a.nome,
              c.nome_classe AS classe_nome,
              COUNT(f.id) AS total_aulas,
              COALESCE(SUM(CASE WHEN f.presente = 1 THEN 1 ELSE 0 END), 0) AS presencas,
              COALESCE(SUM(CASE WHEN f.presente = 0 THEN 1 ELSE 0 END), 0) AS faltas,
              ROUND(COALESCE((SUM(CASE WHEN f.presente = 1 THEN 1 ELSE 0 END) * 100.0) / NULLIF(COUNT(f.id), 0), 0), 2) AS frequencia,
              CASE
                WHEN COALESCE((SUM(CASE WHEN f.presente = 1 THEN 1 ELSE 0 END) * 100.0) / NULLIF(COUNT(f.id), 0), 0) >= 75 THEN 'Regular'
                ELSE 'Atenção'
              END AS situacao
       FROM alunos a
       INNER JOIN classes c ON c.id = a.classe_id
       LEFT JOIN frequencias f ON f.aluno_id = a.id
       AND EXTRACT(DOW FROM f.data_aula) = 0
       GROUP BY a.id, a.nome, c.nome_classe
       ORDER BY a.nome ASC`,
    );

    const totalAlunos = alunos.length;
    const totalPresencas = alunos.reduce((acc, aluno) => acc + Number(aluno.presencas ?? 0), 0);
    const totalFaltas = alunos.reduce((acc, aluno) => acc + Number(aluno.faltas ?? 0), 0);
    const mediaGeral = totalAlunos > 0
      ? Number((alunos.reduce((acc, aluno) => acc + Number(aluno.frequencia ?? 0), 0) / totalAlunos).toFixed(2))
      : 0;

    return res.json({
      period_label: 'Geral anual',
      turmas,
      alunos,
      resumo: {
        totalAlunos,
        totalClasses: turmas.length,
        totalPresencas,
        totalFaltas,
        mediaGeral,
      },
    });
  } catch (error) {
    console.error('Erro ao gerar relatório geral:', error);
    return res.status(500).json({ error: 'Não foi possível gerar o relatório geral da EBD.' });
  }
});

app.get('/api/relatorios/trimestre/:trimestre', async (req: Request, res: Response) => {
  try {
    const trimestre = Number(req.params.trimestre);

    if (!Number.isInteger(trimestre) || trimestre < 1 || trimestre > 4) {
      return res.status(400).json({ error: 'O trimestre deve ser um valor entre 1 e 4.' });
    }

    const trimestreConfig = {
      1: { label: '1º Trimestre (Jan / Fev / Mar)', meses: [1, 2, 3] },
      2: { label: '2º Trimestre (Abr / Mai / Jun)', meses: [4, 5, 6] },
      3: { label: '3º Trimestre (Jul / Ago / Set)', meses: [7, 8, 9] },
      4: { label: '4º Trimestre (Out / Nov / Dez)', meses: [10, 11, 12] },
    };

    const config = trimestreConfig[trimestre as keyof typeof trimestreConfig];
    const [mesInicio, mesFim] = [config.meses[0], config.meses[2]];

    const turmas = await all<{
      id: number;
      nome_classe: string;
      total_alunos: number;
      total_presencas: number;
      media_presenca: number;
    }>(
      `SELECT c.id,
              c.nome_classe,
              COUNT(DISTINCT a.id) AS total_alunos,
              COALESCE(SUM(CASE WHEN f.presente = 1 THEN 1 ELSE 0 END), 0) AS total_presencas,
              ROUND(COALESCE((SUM(CASE WHEN f.presente = 1 THEN 1 ELSE 0 END) * 100.0) / NULLIF(COUNT(f.id), 0), 0), 2) AS media_presenca
       FROM classes c
       LEFT JOIN alunos a ON a.classe_id = c.id
       LEFT JOIN frequencias f ON f.aluno_id = a.id
       AND f.classe_id = c.id
       AND EXTRACT(DOW FROM f.data_aula) = 0
       AND EXTRACT(MONTH FROM f.data_aula)::int BETWEEN ? AND ?
       GROUP BY c.id, c.nome_classe
       ORDER BY c.nome_classe ASC`,
      [mesInicio, mesFim],
    );

    const alunos = await all<{
      id: number;
      nome: string;
      classe_nome: string;
      total_aulas: number;
      presencas: number;
      faltas: number;
      frequencia: number;
      situacao: string;
    }>(
      `SELECT a.id,
              a.nome,
              c.nome_classe AS classe_nome,
              COUNT(f.id) AS total_aulas,
              COALESCE(SUM(CASE WHEN f.presente = 1 THEN 1 ELSE 0 END), 0) AS presencas,
              COALESCE(SUM(CASE WHEN f.presente = 0 THEN 1 ELSE 0 END), 0) AS faltas,
              ROUND(COALESCE((SUM(CASE WHEN f.presente = 1 THEN 1 ELSE 0 END) * 100.0) / NULLIF(COUNT(f.id), 0), 0), 2) AS frequencia,
              CASE
                WHEN COALESCE((SUM(CASE WHEN f.presente = 1 THEN 1 ELSE 0 END) * 100.0) / NULLIF(COUNT(f.id), 0), 0) >= 75 THEN 'Regular'
                ELSE 'Atenção'
              END AS situacao
       FROM alunos a
       INNER JOIN classes c ON c.id = a.classe_id
       LEFT JOIN frequencias f ON f.aluno_id = a.id
       AND EXTRACT(DOW FROM f.data_aula) = 0
       AND EXTRACT(MONTH FROM f.data_aula)::int BETWEEN ? AND ?
       GROUP BY a.id, a.nome, c.nome_classe
       ORDER BY a.nome ASC`,
      [mesInicio, mesFim],
    );

    const totalAlunos = alunos.length;
    const totalPresencas = alunos.reduce((acc, aluno) => acc + Number(aluno.presencas ?? 0), 0);
    const totalFaltas = alunos.reduce((acc, aluno) => acc + Number(aluno.faltas ?? 0), 0);
    const mediaGeral = totalAlunos > 0
      ? Number((alunos.reduce((acc, aluno) => acc + Number(aluno.frequencia ?? 0), 0) / totalAlunos).toFixed(2))
      : 0;

    return res.json({
      periodo: trimestre,
      period_label: config.label,
      turmas,
      alunos,
      resumo: {
        totalAlunos,
        totalClasses: turmas.length,
        totalPresencas,
        totalFaltas,
        mediaGeral,
      },
    });
  } catch (error) {
    console.error('Erro ao gerar relatório por trimestre:', error);
    return res.status(500).json({ error: 'Não foi possível gerar o relatório do trimestre solicitado.' });
  }
});

function getErrorCode(error: unknown): string | undefined {
  let current = error;

  while (typeof current === 'object' && current !== null) {
    if ('code' in current && typeof current.code === 'string') {
      return current.code;
    }

    current = 'cause' in current ? current.cause : null;
  }

  return undefined;
}

app.use((error: Error & { status?: number; type?: string }, _req: Request, res: Response, _next: NextFunction) => {
  if (error?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'JSON inválido enviado na requisição.' });
  }

  if (['ENETUNREACH', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNRESET', 'EHOSTUNREACH', 'EAI_AGAIN'].includes(getErrorCode(error) ?? '')) {
    console.error('Banco de dados indisponível:', error);
    return res.status(503).json({
      error: 'Não foi possível conectar ao banco de dados. Verifique a DATABASE_URL no arquivo .env e confirme que o banco está acessível.',
    });
  }

  console.error('Erro interno do servidor:', error);
  return res.status(500).json({ error: 'Erro interno do servidor.' });
});

export function startServer(): void {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor SSS rodando na porta ${PORT}`);
  });
}

export default app;
