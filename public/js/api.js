const API_BASE = '';

function getAuthToken() {
  return localStorage.getItem('sssToken') || '';
}

async function requestJson(url, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  const token = getAuthToken();
  if (token && !url.includes('/api/auth/')) {
    headers.Authorization = `Bearer ${token}`;
  }

  let response;
  try {
    response = await fetch(`${API_BASE}${url}`, {
      ...options,
      headers,
    });
  } catch {
    throw new Error('Não foi possível acessar o servidor local. Inicie o sistema com npm run dev e abra http://localhost:8080.');
  }

  const contentType = response.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const payload = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    const message = typeof payload === 'object' && payload && payload.error
      ? payload.error
      : `O servidor respondeu com HTTP ${response.status}. Confirme que o backend local está atualizado.`;
    throw new Error(message);
  }

  if (!isJson) {
    throw new Error('A API retornou uma resposta inesperada. Inicie a versão local com npm run dev e abra http://localhost:8080.');
  }

  return payload;
}

export async function validarContexto(chaveContexto) {
  return requestJson('/api/auth/validar-contexto', {
    method: 'POST',
    body: JSON.stringify({ chave_contexto: chaveContexto }),
  });
}

export async function loginContexto(payload) {
  return requestJson('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function getClasses() {
  return requestJson('/api/classes');
}

export async function getAgendas() {
  return requestJson('/api/agendas');
}

export async function getAlunos() {
  return requestJson('/api/alunos');
}

export async function getUsuarios() {
  return requestJson('/api/usuarios');
}

export async function getCargos() {
  return requestJson('/api/cargos');
}

export async function createCargo(payload) {
  return requestJson('/api/cargos', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateCargo(id, payload) {
  return requestJson(`/api/cargos/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function deleteCargo(id) {
  return requestJson(`/api/cargos/${id}`, {
    method: 'DELETE',
  });
}

export async function getDashboardStats() {
  return requestJson('/api/dashboard/stats');
}

export async function savePresenca(payload) {
  return requestJson('/api/frequencias', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function createAluno(payload) {
  return requestJson('/api/alunos', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function createClasse(payload) {
  return requestJson('/api/classes', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function createUsuario(payload) {
  return requestJson('/api/usuarios', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function createAgenda(payload) {
  return requestJson('/api/agendas', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateAgenda(id, payload) {
  return requestJson(`/api/agendas/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function deleteAgenda(id) {
  return requestJson(`/api/agendas/${id}`, {
    method: 'DELETE',
  });
}

export async function updateAluno(id, payload) {
  return requestJson(`/api/alunos/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function deleteAluno(id) {
  return requestJson(`/api/alunos/${id}`, {
    method: 'DELETE',
  });
}

export async function getRelatorioAluno(id) {
  return requestJson(`/api/relatorios/aluno/${id}`);
}

export async function getRelatorioAlunoPorNome(nome) {
  const params = new URLSearchParams({ nome });
  return requestJson(`/api/relatorios/aluno?${params.toString()}`);
}

export async function getRelatorioClasse(classeId) {
  return requestJson(`/api/relatorios/classe/${classeId}`);
}

export async function getRelatorioGeral() {
  return requestJson('/api/relatorios/geral');
}

export async function getRelatorioTrimestre(trimestre) {
  return requestJson(`/api/relatorios/trimestre/${trimestre}`);
}
