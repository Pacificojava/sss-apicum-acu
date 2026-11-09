import {
  createAgenda,
  createAluno,
  createCargo,
  createClasse,
  createUsuario,
  deleteAgenda,
  deleteAluno,
  deleteCargo,
  getAgendas,
  getAlunos,
  getCargos,
  getClasses,
  getDashboardStats,
  getRelatorioAluno,
  getRelatorioAlunoPorNome,
  getRelatorioClasse,
  getRelatorioGeral,
  getRelatorioTrimestre,
  getUsuarios,
  loginContexto,
  savePresenca,
  updateAgenda,
  updateAluno,
  updateCargo,
  validarContexto,
} from './api.js';
import { LOGO_CONFIG, createLogoMarkup, getLogoConfig } from './logo-config.js';

const state = {
  trimestre: 1,
};

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
];

const contentSections = document.querySelectorAll('.content-section');
const navItems = document.querySelectorAll('.nav-item');
const toasts = document.querySelector('#toastContainer');
const pageTitle = document.querySelector('#pageTitle');

const sectionTitles = {
  dashboard: 'Dashboard da EBD',
  alunos: 'Alunos',
  professores: 'Professores e Secretaria',
  turmas: 'Turmas da EBD',
  frequencia: 'Presença',
  agenda: 'Agenda da EBD',
  relatorios: 'Relatórios e indicadores',
  configuracoes: 'Configurações',
};

function getCurrentUser() {
  try {
    return JSON.parse(localStorage.getItem('sssUser') || 'null');
  } catch (error) {
    console.warn('Não foi possível recuperar o usuário do localStorage.', error);
    return null;
  }
}

function getUserRoleLabel(nivelPerfil) {
  return nivelPerfil === 'secretaria_geral' ? 'Secretária Geral' : 'Auxiliar da Secretaria';
}

function renderLogos() {
  const logoSlots = document.querySelectorAll('[data-logo-slot]');

  logoSlots.forEach((slot) => {
    const key = slot.dataset.logoSlot;
    const config = getLogoConfig(key);
    const logoMarkup = createLogoMarkup(key, 'report-logo');

    if (!logoMarkup || !config) {
      return;
    }

    slot.innerHTML = logoMarkup;
    const img = slot.querySelector('img');

    if (img) {
      img.src = config.src;
      img.alt = config.alt;
    }
  });
}

function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast-message ${type}`;
  toast.textContent = message;

  if (toasts) {
    toasts.appendChild(toast);
    setTimeout(() => toast.remove(), 2800);
  }
}

function renderAuthState() {
  renderLogos();

  const appShell = document.querySelector('#appShellWrapper');
  const loginScreen = document.querySelector('#loginScreen');
  const currentUser = getCurrentUser();

  const userBadge = document.querySelector('#currentUserName');
  const userRole = document.querySelector('#currentUserRole');
  if (userBadge) userBadge.textContent = currentUser?.nome || 'Usuário';
  if (userRole) userRole.textContent = getUserRoleLabel(currentUser?.nivel_perfil);

  const configItem = document.querySelector('.nav-item[data-section="configuracoes"]');
  const userHasAdminAccess = currentUser?.nivel_perfil === 'secretaria_geral';
  if (configItem) {
    configItem.classList.toggle('hidden', !userHasAdminAccess);
  }

  if (!currentUser || !localStorage.getItem('sssToken')) {
    if (appShell) appShell.classList.add('hidden');
    if (loginScreen) loginScreen.classList.remove('hidden');
    return;
  }

  if (appShell) appShell.classList.remove('hidden');
  if (loginScreen) loginScreen.classList.add('hidden');
}

function logoutSession() {
  localStorage.removeItem('sssToken');
  localStorage.removeItem('sssUser');
  renderAuthState();
  showToast('Sessão encerrada.', 'info');
}

function bindAuthControls() {
  const loginForm = document.querySelector('#loginForm');
  const logoutButton = document.querySelector('#btnLogoutSession');

  if (loginForm) {
    loginForm.addEventListener('submit', handleLoginSubmit);
  }

  if (logoutButton) {
    logoutButton.addEventListener('click', logoutSession);
  }
}

async function handleLoginSubmit(event) {
  event.preventDefault();

  const chaveContexto = document.querySelector('#contextoIgreja')?.value.trim();
  const login = document.querySelector('#loginUsuario')?.value.trim();
  const senha = document.querySelector('#loginSenha')?.value;

  if (!chaveContexto || !login || !senha) {
    showToast('Informe a chave da igreja, usuário e senha.', 'error');
    return;
  }

  try {
    const contexto = await validarContexto(chaveContexto);
    if (!contexto?.valido) {
      throw new Error(contexto?.mensagem || 'Contexto da igreja inválido.');
    }

    const response = await loginContexto({ chave_contexto: chaveContexto, login, senha });
    localStorage.setItem('sssToken', response.token);
    localStorage.setItem('sssUser', JSON.stringify(response.user));
    renderAuthState();
    await initialize();
    showToast('Login realizado com sucesso!', 'success');
  } catch (error) {
    console.error('Erro ao realizar login:', error);
    showToast(error.message || 'Não foi possível autenticar no sistema.', 'error');
  }
}

function activateSection(sectionName) {
  contentSections.forEach((section) => {
    const isActive = section.dataset.section === sectionName;
    section.classList.toggle('active', isActive);
  });

  navItems.forEach((item) => {
    const isActive = item.dataset.section === sectionName;
    item.classList.toggle('active', isActive);
  });

  if (pageTitle && sectionTitles[sectionName]) {
    pageTitle.textContent = sectionTitles[sectionName];
  }
}

navItems.forEach((item) => {
  item.addEventListener('click', (event) => {
    event.preventDefault();
    activateSection(item.dataset.section);
  });
});

async function loadDashboardStats() {
  try {
    const stats = await getDashboardStats();

    const totalAlunos = document.querySelector('#totalAlunosStat');
    const taxaPresenca = document.querySelector('#taxaPresencaStat');
    const totalClasses = document.querySelector('#totalClassesStat');
    const presencas = document.querySelector('#presencasStat');
    const reportTaxa = document.querySelector('#reportTaxa');
    const reportAlunos = document.querySelector('#reportAlunos');
    const reportTurmas = document.querySelector('#reportTurmas');

    if (totalAlunos) totalAlunos.textContent = stats.totalAlunos ?? 0;
    if (taxaPresenca) taxaPresenca.textContent = `${stats.taxaPresenca ?? 0}%`;
    if (totalClasses) totalClasses.textContent = stats.totalClasses ?? 0;
    if (presencas) presencas.textContent = `${stats.presencas ?? 0} / ${stats.totalFrequencias ?? 0}`;
    if (reportTaxa) reportTaxa.textContent = `${stats.taxaPresenca ?? 0}%`;
    if (reportAlunos) reportAlunos.textContent = stats.totalAlunos ?? 0;
    if (reportTurmas) reportTurmas.textContent = stats.totalClasses ?? 0;

    return stats;
  } catch (error) {
    console.error('Erro ao carregar estatísticas:', error);
    showToast('Não foi possível carregar as estatísticas do dashboard.', 'error');
    return null;
  }
}

function bindEditAlunoButtons() {
  document.querySelectorAll('.btn-edit-aluno').forEach((button) => {
    button.addEventListener('click', () => {
      const alunoId = Number(button.dataset.alunoId);
      const aluno = button.dataset.aluno;

      const parsedAluno = JSON.parse(aluno || '{}');
      const modal = document.querySelector('#editAlunoModal');
      const form = document.querySelector('#editAlunoForm');
      const inputNome = document.querySelector('#editAlunoNome');
      const inputIdade = document.querySelector('#editAlunoIdade');
      const selectTurma = document.querySelector('#editAlunoTurma');
      const selectCargo = document.querySelector('#editAlunoCargo');

      if (!modal || !form || !inputNome || !inputIdade || !selectTurma || !selectCargo) return;

      inputNome.value = parsedAluno.nome || '';
      inputIdade.value = parsedAluno.idade || 0;
      selectTurma.value = String(parsedAluno.classe_id || '');
      selectCargo.value = ALUNO_CARGOS.includes(parsedAluno.cargo) ? parsedAluno.cargo : 'Membro';
      form.dataset.alunoId = String(alunoId);

      const bootstrapModal = window.bootstrap ? new window.bootstrap.Modal(modal) : null;
      if (bootstrapModal) {
        bootstrapModal.show();
      }
    });
  });
}

function bindDeleteAlunoButtons() {
  document.querySelectorAll('.btn-delete-aluno').forEach((button) => {
    button.addEventListener('click', async () => {
      const alunoId = Number(button.dataset.alunoId);
      const alunoNome = button.dataset.alunoNome || 'este aluno';

      const confirmed = window.confirm(`Deseja realmente excluir ${alunoNome}?`);
      if (!confirmed) return;

      try {
        await deleteAluno(alunoId);
        showToast('Aluno excluído com sucesso!', 'success');
        await Promise.all([loadDashboardStats(), loadAlunos()]);
      } catch (error) {
        console.error('Erro ao excluir aluno:', error);
        showToast(error.message || 'Não foi possível excluir o aluno.', 'error');
      }
    });
  });
}

function renderAlunoRows(alunos, selector = '#alunosTableBody') {
  const tableBody = document.querySelector(selector);

  if (!tableBody) return;

  if (!alunos.length) {
    tableBody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">Nenhum aluno cadastrado.</td></tr>';
    return;
  }

  tableBody.innerHTML = alunos
    .map((aluno) => `
      <tr>
        <td>${aluno.nome}</td>
        <td>${aluno.classe_nome || aluno.classe_id || 'Sem turma'}</td>
        <td>${aluno.cargo || 'Membro'}</td>
        <td>${aluno.idade} anos</td>
        <td><span class="badge badge-good">Ativo</span></td>
        <td>
          <button
            class="btn btn-sm btn-outline-primary btn-edit-aluno"
            type="button"
            data-aluno-id="${aluno.id}"
            data-aluno='${JSON.stringify(aluno).replace(/'/g, '&apos;')}'
          >
            Editar
          </button>
        </td>
        <td>
          <button
            class="btn btn-sm btn-outline-danger btn-delete-aluno"
            type="button"
            data-aluno-id="${aluno.id}"
            data-aluno-nome="${aluno.nome}"
          >
            Excluir
          </button>
        </td>
      </tr>
    `)
    .join('');

  bindEditAlunoButtons();
  bindDeleteAlunoButtons();
}

function renderClassRows(classes) {
  const tableBody = document.querySelector('#classesTableBody');

  if (!tableBody) return;

  if (!classes.length) {
    tableBody.innerHTML = '<tr><td colspan="3" class="text-center text-muted">Nenhuma turma cadastrada.</td></tr>';
    return;
  }

  tableBody.innerHTML = classes
    .map((item) => `
      <tr>
        <td>${item.id}</td>
        <td>${item.nome_classe}</td>
        <td><span class="badge badge-good">Ativa</span></td>
      </tr>
    `)
    .join('');
}

function renderUsuarioRows(usuarios) {
  const tableBody = document.querySelector('#professoresTableBody');

  if (!tableBody) return;

  if (!usuarios.length) {
    tableBody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">Nenhum usuário cadastrado.</td></tr>';
    return;
  }

  tableBody.innerHTML = usuarios
    .map((usuario) => `
      <tr>
        <td>${usuario.nome}</td>
        <td>${usuario.login}</td>
        <td>${usuario.nivel_perfil === 'secretaria_geral' ? 'Secretária Geral' : 'Auxiliar da Secretaria'}</td>
        <td><span class="badge badge-good">Ativo</span></td>
      </tr>
    `)
    .join('');
}

function formatPercent(value) {
  const numericValue = Number(value ?? 0);
  return `${numericValue.toFixed(2)}%`;
}

function renderRelatorioAluno(report) {
  const tbody = document.querySelector('#relatorioAlunoTableBody');
  const historyBody = document.querySelector('#relatorioAlunoHistoricoBody');
  const card = document.querySelector('#relatorioAlunoSummary');

  if (!tbody) return;

  if (!report || !report.aluno) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">Nenhum dado disponível.</td></tr>';
    if (historyBody) {
      historyBody.innerHTML = '<tr><td colspan="3" class="text-center text-muted">Selecione um aluno para visualizar o histórico.</td></tr>';
    }
    if (card) {
      card.innerHTML = '<span class="badge bg-secondary">Selecione um aluno</span>';
    }
    return;
  }

  const taxa = Number(report.taxaFrequencia ?? 0);
  const statusClass = taxa >= 75 ? 'bg-success' : 'bg-danger';
  const statusLabel = taxa >= 75 ? 'Frequência OK' : 'Risco de Evasão';
  const faltasDatas = report.faltasDatas || [];
  const faltasFormatadas = faltasDatas.length
    ? faltasDatas.map(formatAttendanceDate).join(', ')
    : 'Nenhuma falta registrada';

  tbody.innerHTML = `
    <tr>
      <td>${report.aluno.nome}</td>
      <td>${report.aluno.classe_nome || 'Sem turma'}</td>
      <td>${report.totalAulas ?? 0}</td>
      <td>${report.totalPresencas ?? 0}</td>
      <td>${report.totalFaltas ?? 0}</td>
      <td>${formatPercent(taxa)}</td>
      <td><span class="badge ${statusClass}">${statusLabel}</span></td>
    </tr>
  `;

  if (historyBody) {
    const history = report.historicoFrequencia || [];
    historyBody.innerHTML = history.length
      ? history.map((frequencia) => {
        const presente = Number(frequencia.presente) === 1;
        return `
          <tr>
            <td>${formatAttendanceDate(frequencia.data_aula)}</td>
            <td>${frequencia.classe_nome || report.aluno.classe_nome || '—'}</td>
            <td><span class="badge ${presente ? 'bg-success' : 'bg-danger'}">${presente ? 'Presente' : 'Faltou'}</span></td>
          </tr>
        `;
      }).join('')
      : '<tr><td colspan="3" class="text-center text-muted">Ainda não há frequência registrada para este aluno.</td></tr>';
  }

  if (card) {
    card.innerHTML = `
      <div class="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-2">
        <div>
          <small class="text-muted d-block">Aluno selecionado</small>
          <strong>${report.aluno.nome}</strong>
        </div>
        <span class="badge ${statusClass}">${statusLabel}</span>
      </div>
      <div class="mt-3">
        <small class="text-muted d-block">Domingos em que faltou</small>
        <strong>${faltasFormatadas}</strong>
      </div>
    `;
  }
}

function formatAttendanceDate(dateValue) {
  const dateOnly = String(dateValue).slice(0, 10);
  const date = new Date(`${dateOnly}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? dateValue
    : date.toLocaleDateString('pt-BR');
}

function renderRelatorioClasse(report) {
  const tbody = document.querySelector('#relatorioClasseTableBody');
  const title = document.querySelector('#relatorioClasseTitle');
  const resumo = document.querySelector('#relatorioClasseResumo');

  if (!tbody) return;

  if (!report || !report.classe) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">Nenhuma turma selecionada.</td></tr>';
    if (title) title.textContent = 'Selecione uma turma';
    if (resumo) resumo.innerHTML = '';
    return;
  }

  if (title) title.textContent = report.classe.nome_classe;

  if (resumo) {
    resumo.innerHTML = `
      <div class="row g-3">
        <div class="col-md-4">
          <div class="border rounded p-3 h-100 bg-light-subtle">
            <small class="text-muted">Total de alunos</small>
            <div class="fs-4 fw-bold">${report.totalAlunos ?? 0}</div>
          </div>
        </div>
        <div class="col-md-4">
          <div class="border rounded p-3 h-100 bg-light-subtle">
            <small class="text-muted">Média de frequência</small>
            <div class="fs-4 fw-bold">${formatPercent(report.mediaFrequencia ?? 0)}</div>
          </div>
        </div>
        <div class="col-md-4">
          <div class="border rounded p-3 h-100 bg-light-subtle">
            <small class="text-muted">Situação geral</small>
            <div class="fs-5 fw-semibold ${Number(report.mediaFrequencia ?? 0) >= 75 ? 'text-success' : 'text-danger'}">
              ${Number(report.mediaFrequencia ?? 0) >= 75 ? 'Regular' : 'Atenção'}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  if (!report.alunos?.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">Nenhum aluno matriculado nesta turma.</td></tr>';
    return;
  }

  tbody.innerHTML = report.alunos
    .map((aluno) => {
      const taxa = Number(aluno.frequencia ?? 0);
      const statusLabel = taxa >= 75 ? 'Regular' : 'Atenção';
      const statusClass = taxa >= 75 ? 'bg-success' : 'bg-warning text-dark';

      return `
        <tr>
          <td>${aluno.nome}</td>
          <td>${aluno.presencas ?? 0}</td>
          <td>${aluno.faltas ?? 0}</td>
          <td>${formatPercent(taxa)}</td>
          <td><span class="badge ${statusClass}">${statusLabel}</span></td>
        </tr>
      `;
    })
    .join('');
}

function renderRelatorioGeral(report) {
  const turmaBody = document.querySelector('#relatorioGeralTurmasTableBody');
  const alunoBody = document.querySelector('#relatorioGeralAlunosTableBody');
  const resumo = document.querySelector('#relatorioGeralResumo');

  if (turmaBody) {
    if (!report?.turmas?.length) {
      turmaBody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">Nenhuma turma cadastrada.</td></tr>';
    } else {
      turmaBody.innerHTML = report.turmas
        .map((turma) => `
          <tr>
            <td>${turma.nome_classe}</td>
            <td>${turma.total_alunos ?? 0}</td>
            <td>${turma.total_presencas ?? 0}</td>
            <td>${formatPercent(turma.media_presenca ?? 0)}</td>
          </tr>
        `)
        .join('');
    }
  }

  if (alunoBody) {
    if (!report?.alunos?.length) {
      alunoBody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Nenhum aluno cadastrado.</td></tr>';
    } else {
      alunoBody.innerHTML = report.alunos
        .map((aluno) => {
          const taxa = Number(aluno.frequencia ?? 0);
          const statusLabel = taxa >= 75 ? 'Regular' : 'Atenção';
          const statusClass = taxa >= 75 ? 'bg-success' : 'bg-warning text-dark';

          return `
            <tr>
              <td>${aluno.nome}</td>
              <td>${aluno.classe_nome || 'Sem turma'}</td>
              <td>${aluno.presencas ?? 0}</td>
              <td>${aluno.faltas ?? 0}</td>
              <td>${formatPercent(taxa)}</td>
              <td><span class="badge ${statusClass}">${statusLabel}</span></td>
            </tr>
          `;
        })
        .join('');
    }
  }

  if (resumo) {
    const summary = report?.resumo ?? {};
    resumo.innerHTML = `
      <div class="row g-3">
        <div class="col-md-3">
          <div class="border rounded p-3 h-100 bg-light-subtle">
            <small class="text-muted">Alunos</small>
            <div class="fs-4 fw-bold">${summary.totalAlunos ?? 0}</div>
          </div>
        </div>
        <div class="col-md-3">
          <div class="border rounded p-3 h-100 bg-light-subtle">
            <small class="text-muted">Turmas</small>
            <div class="fs-4 fw-bold">${summary.totalClasses ?? 0}</div>
          </div>
        </div>
        <div class="col-md-3">
          <div class="border rounded p-3 h-100 bg-light-subtle">
            <small class="text-muted">Presenças</small>
            <div class="fs-4 fw-bold">${summary.totalPresencas ?? 0}</div>
          </div>
        </div>
        <div class="col-md-3">
          <div class="border rounded p-3 h-100 bg-light-subtle">
            <small class="text-muted">Média geral</small>
            <div class="fs-4 fw-bold">${formatPercent(summary.mediaGeral ?? 0)}</div>
          </div>
        </div>
      </div>
    `;
  }
}

function formatAgendaDate(dateValue) {
  if (!dateValue) return 'Sem data';
  const normalized = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(normalized.getTime())) {
    return dateValue;
  }

  return normalized.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function renderAgendaSummary(agendas) {
  const list = document.querySelector('#agendaList');
  if (!list) return;

  const items = (agendas || []).slice(0, 4);
  if (!items.length) {
    list.innerHTML = '<li><div><strong>Sem eventos</strong><small>Cadastre uma nova agenda para acompanhar o calendário.</small></div></li>';
    return;
  }

  list.innerHTML = items
    .map((agenda) => `
      <li>
        <span class="event-date">${formatAgendaDate(agenda.data_evento).split('/').join('')}</span>
        <div>
          <strong>${agenda.titulo}</strong>
          <small>${agenda.horario || 'Horário não informado'} • ${agenda.local || 'Local não informado'}</small>
        </div>
      </li>
    `)
    .join('');
}

function renderAgendaRows(agendas) {
  const tableBody = document.querySelector('#agendaTableBody');

  if (!tableBody) return;

  if (!agendas.length) {
    tableBody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Nenhuma agenda cadastrada.</td></tr>';
    return;
  }

  tableBody.innerHTML = agendas
    .map((agenda) => `
      <tr>
        <td>${agenda.titulo}</td>
        <td>${agenda.descricao || 'Sem descrição'}</td>
        <td>${formatAgendaDate(agenda.data_evento)}</td>
        <td>${agenda.horario || '—'}</td>
        <td>${agenda.local || '—'}</td>
        <td>
          <button class="btn btn-sm btn-outline-primary btn-edit-agenda" type="button" data-agenda-id="${agenda.id}" data-agenda='${JSON.stringify(agenda).replace(/'/g, '&apos;')}'>Editar</button>
          <button class="btn btn-sm btn-outline-danger btn-delete-agenda" type="button" data-agenda-id="${agenda.id}" data-agenda-titulo="${agenda.titulo}">Excluir</button>
        </td>
      </tr>
    `)
    .join('');

  bindAgendaEditButtons();
  bindAgendaDeleteButtons();
}

async function loadAgendas() {
  try {
    const agendas = await getAgendas();
    renderAgendaSummary(agendas);
    renderAgendaRows(agendas);
    return agendas;
  } catch (error) {
    console.error('Erro ao carregar agendas:', error);
    renderAgendaSummary([]);
    renderAgendaRows([]);
    showToast('Erro ao carregar a agenda.', 'error');
    return [];
  }
}

async function loadAlunos() {
  try {
    const alunos = await getAlunos();
    renderAlunoRows(alunos, '#alunosTableBody');
    renderAlunoRows(alunos, '#alunosTableBodySection');

    document.querySelectorAll('.attendance-student').forEach((select) => {
      select.innerHTML = '<option value="">Selecione o aluno</option>' + alunos
        .map((aluno) => `<option value="${aluno.id}" data-classe-id="${aluno.classe_id}">${aluno.nome}</option>`)
        .join('');
    });

    return alunos;
  } catch (error) {
    console.error('Erro ao carregar alunos:', error);
    renderAlunoRows([], '#alunosTableBody');
    renderAlunoRows([], '#alunosTableBodySection');
    showToast('Erro ao carregar a lista de alunos.', 'error');
    return [];
  }
}

async function loadClasses() {
  try {
    const classes = await getClasses();
    renderClassRows(classes);

    const selects = document.querySelectorAll('.classeSelect');
    selects.forEach((select) => {
      select.innerHTML = '<option value="">Escolha a turma</option>' + classes
        .map((item) => `<option value="${item.id}">${item.nome_classe}</option>`)
        .join('');
    });

    return classes;
  } catch (error) {
    console.error('Erro ao carregar turmas:', error);
    renderClassRows([]);
    showToast('Erro ao carregar a lista de turmas.', 'error');
    return [];
  }
}

async function loadUsuarios() {
  try {
    const usuarios = await getUsuarios();
    renderUsuarioRows(usuarios);
    return usuarios;
  } catch (error) {
    console.error('Erro ao carregar usuários:', error);
    renderUsuarioRows([]);
    showToast('Erro ao carregar a lista de usuários.', 'error');
    return [];
  }
}

function renderCargoRows(cargos) {
  const tableBody = document.querySelector('#cargosTableBody');
  if (!tableBody) return;

  if (!cargos.length) {
    tableBody.innerHTML = '<tr><td colspan="3" class="text-center text-muted">Nenhum cargo cadastrado.</td></tr>';
    return;
  }

  tableBody.innerHTML = cargos
    .map((cargo) => `
      <tr>
        <td>${cargo.nome}</td>
        <td><span class="badge ${cargo.ativo ? 'bg-success' : 'bg-secondary'}">${cargo.ativo ? 'Ativo' : 'Inativo'}</span></td>
        <td class="text-end">
          <button type="button" class="btn btn-sm btn-outline-primary me-2 btn-edit-cargo" data-cargo-id="${cargo.id}" data-cargo-nome="${cargo.nome}">Editar</button>
          <button type="button" class="btn btn-sm btn-outline-danger btn-delete-cargo" data-cargo-id="${cargo.id}" data-cargo-nome="${cargo.nome}">Excluir</button>
        </td>
      </tr>
    `)
    .join('');

  document.querySelectorAll('.btn-edit-cargo').forEach((button) => {
    button.addEventListener('click', () => {
      const cargoForm = document.querySelector('#cargoForm');
      const cargoId = document.querySelector('#cargoId');
      const cargoNome = document.querySelector('#cargoNome');
      const cargo = button.dataset.cargoNome || '';

      if (cargoForm && cargoId && cargoNome) {
        cargoId.value = button.dataset.cargoId || '';
        cargoNome.value = cargo;
        cargoNome.focus();
      }
    });
  });

  document.querySelectorAll('.btn-delete-cargo').forEach((button) => {
    button.addEventListener('click', async () => {
      const cargoId = Number(button.dataset.cargoId || 0);
      const nome = button.dataset.cargoNome || 'este cargo';
      const confirmDelete = window.confirm(`Deseja realmente excluir "${nome}"?`);

      if (!confirmDelete || !cargoId) return;

      try {
        await deleteCargo(cargoId);
        showToast('Cargo excluído com sucesso!', 'success');
        await loadCargos();
        await loadAlunos();
      } catch (error) {
        console.error('Erro ao excluir cargo:', error);
        showToast(error.message || 'Não foi possível excluir o cargo.', 'error');
      }
    });
  });
}

async function loadCargos() {
  try {
    const cargos = await getCargos();
    renderCargoRows(cargos || []);
    populateCargoSelects(cargos || []);
    return cargos || [];
  } catch (error) {
    console.error('Erro ao carregar cargos:', error);
    renderCargoRows([]);
    showToast('Erro ao carregar os cargos.', 'error');
    return [];
  }
}

function populateCargoSelects(cargos) {
  const cargoSelects = document.querySelectorAll('#newAlunoCargo, #editAlunoCargo');
  cargoSelects.forEach((select) => {
    const currentValue = select.value || 'Membro';
    const options = [
      '<option value="">Selecione o cargo</option>',
      ...cargos.map((cargo) => `<option value="${cargo.nome}">${cargo.nome}</option>`),
      '<option value="Membro">Membro</option>',
    ];
    select.innerHTML = options.join('');
    if (Array.from(select.options).some((option) => option.value === currentValue)) {
      select.value = currentValue;
    }
  });
}

function bindAgendaEditButtons() {
  document.querySelectorAll('.btn-edit-agenda').forEach((button) => {
    button.addEventListener('click', () => {
      const agenda = JSON.parse(button.dataset.agenda || '{}');
      const modal = document.querySelector('#editAgendaModal');
      const form = document.querySelector('#editAgendaForm');
      const inputTitulo = document.querySelector('#editAgendaTitulo');
      const inputDescricao = document.querySelector('#editAgendaDescricao');
      const inputData = document.querySelector('#editAgendaData');
      const inputHorario = document.querySelector('#editAgendaHorario');
      const inputLocal = document.querySelector('#editAgendaLocal');

      if (!modal || !form || !inputTitulo || !inputDescricao || !inputData || !inputHorario || !inputLocal) return;

      inputTitulo.value = agenda.titulo || '';
      inputDescricao.value = agenda.descricao || '';
      inputData.value = agenda.data_evento || '';
      inputHorario.value = agenda.horario || '';
      inputLocal.value = agenda.local || '';
      form.dataset.agendaId = String(agenda.id || '');

      if (window.bootstrap) {
        new window.bootstrap.Modal(modal).show();
      }
    });
  });
}

function bindAgendaDeleteButtons() {
  document.querySelectorAll('.btn-delete-agenda').forEach((button) => {
    button.addEventListener('click', async () => {
      const agendaId = Number(button.dataset.agendaId);
      const agendaTitulo = button.dataset.agendaTitulo || 'esta agenda';
      const confirmed = window.confirm(`Deseja realmente excluir "${agendaTitulo}"?`);
      if (!confirmed) return;

      try {
        await deleteAgenda(agendaId);
        showToast('Agenda excluída com sucesso!', 'success');
        await Promise.all([loadAgendas(), loadDashboardStats()]);
      } catch (error) {
        console.error('Erro ao excluir agenda:', error);
        showToast(error.message || 'Não foi possível excluir a agenda.', 'error');
      }
    });
  });
}

function bindNewAgendaForm() {
  const form = document.querySelector('#newAgendaForm');
  if (!form) return;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const titulo = document.querySelector('#newAgendaTitulo')?.value.trim();
    const descricao = document.querySelector('#newAgendaDescricao')?.value.trim();
    const dataEvento = document.querySelector('#newAgendaData')?.value;
    const horario = document.querySelector('#newAgendaHorario')?.value.trim();
    const local = document.querySelector('#newAgendaLocal')?.value.trim();

    if (!titulo || !dataEvento) {
      showToast('Preencha o título e a data da agenda.', 'error');
      return;
    }

    try {
      await createAgenda({ titulo, descricao, data_evento: dataEvento, horario, local });
      showToast('Agenda cadastrada com sucesso!', 'success');
      form.reset();
      const modal = document.querySelector('#newAgendaModal');
      if (window.bootstrap && modal) {
        window.bootstrap.Modal.getInstance(modal)?.hide();
      }
      await Promise.all([loadAgendas(), loadDashboardStats()]);
    } catch (error) {
      console.error('Erro ao criar agenda:', error);
      showToast(error.message || 'Não foi possível cadastrar a agenda.', 'error');
    }
  });
}

function bindEditAgendaForm() {
  const form = document.querySelector('#editAgendaForm');
  if (!form) return;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const agendaId = Number(form.dataset.agendaId || 0);
    const titulo = document.querySelector('#editAgendaTitulo')?.value.trim();
    const descricao = document.querySelector('#editAgendaDescricao')?.value.trim();
    const dataEvento = document.querySelector('#editAgendaData')?.value;
    const horario = document.querySelector('#editAgendaHorario')?.value.trim();
    const local = document.querySelector('#editAgendaLocal')?.value.trim();

    if (!agendaId || !titulo || !dataEvento) {
      showToast('Título e data da agenda são obrigatórios.', 'error');
      return;
    }

    try {
      await updateAgenda(agendaId, { titulo, descricao, data_evento: dataEvento, horario, local });
      showToast('Agenda atualizada com sucesso!', 'success');
      form.reset();
      const modal = document.querySelector('#editAgendaModal');
      if (window.bootstrap && modal) {
        window.bootstrap.Modal.getInstance(modal)?.hide();
      }
      await Promise.all([loadAgendas(), loadDashboardStats()]);
    } catch (error) {
      console.error('Erro ao atualizar agenda:', error);
      showToast(error.message || 'Não foi possível atualizar a agenda.', 'error');
    }
  });
}

async function exportDashboardPdf() {
  const { jsPDF } = window.jspdf || {};
  if (!jsPDF) {
    showToast('Não foi possível exportar o PDF neste momento.', 'error');
    return;
  }

  try {
    const [stats, alunos, classes, agendas] = await Promise.all([
      getDashboardStats(),
      getAlunos(),
      getClasses(),
      getAgendas(),
    ]);

    const doc = new jsPDF();
    const logoKeys = ['igreja', 'educacaoCrista', 'ebd'];

    async function loadLogoToDataUrl(key) {
      const logoPath = LOGO_CONFIG[key]?.src;
      if (!logoPath) {
        return null;
      }

      const response = await fetch(logoPath);
      const blob = await response.blob();
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });
    }

    const logoData = {};
    for (const key of logoKeys) {
      logoData[key] = await loadLogoToDataUrl(key);
    }

    const imageWidth = 38;
    const imageHeight = 28;
    const gap = 12;
    const startX = 14;
    let xPosition = startX;

    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, 210, 52, 'F');

    logoKeys.forEach((key) => {
      const dataUrl = logoData[key];
      if (dataUrl) {
        try {
          doc.addImage(dataUrl, 'PNG', xPosition, 12, imageWidth, imageHeight);
          xPosition += imageWidth + gap;
        } catch (error) {
          console.warn(`Não foi possível carregar a imagem ${key}:`, error);
        }
      }
    });

    doc.setFontSize(18);
    doc.text('Solution Sunday School (SSS)', 14, 24);
    doc.setFontSize(11);
    doc.text('Relatório de presença, alunos e turmas', 14, 32);

    doc.setFontSize(12);
    doc.text('Resumo geral', 14, 46);
    doc.setFontSize(10);
    const summaryY = 54;
    doc.text(`- Total de alunos: ${stats.totalAlunos ?? 0}`, 14, summaryY);
    doc.text(`- Turmas cadastradas: ${stats.totalClasses ?? 0}`, 14, summaryY + 8);
    doc.text(`- Presenças registradas: ${stats.presencas ?? 0}`, 14, summaryY + 16);
    doc.text(`- Taxa de presença: ${stats.taxaPresenca ?? 0}%`, 14, summaryY + 24);

    let yPos = 90;
    doc.setFontSize(12);
    doc.text('Turmas', 14, yPos);
    doc.setFontSize(10);
    classes.forEach((classe) => {
      const alunosNaTurma = alunos.filter((aluno) => Number(aluno.classe_id) === Number(classe.id)).length;
      doc.text(`- ${classe.nome_classe}: ${alunosNaTurma} aluno(s)`, 18, yPos + 8);
      yPos += 8;
    });

    yPos += 12;
    doc.setFontSize(12);
    doc.text('Alunos', 14, yPos);
    doc.setFontSize(10);
    alunos.slice(0, 12).forEach((aluno) => {
      doc.text(`- ${aluno.nome} (${aluno.classe_nome || 'Sem turma'})`, 18, yPos + 8);
      yPos += 8;
    });

    yPos += 18;
    doc.setFontSize(12);
    doc.text('Agenda', 14, yPos);
    doc.setFontSize(10);
    agendas.slice(0, 8).forEach((agenda) => {
      const label = `${agenda.data_evento} - ${agenda.titulo}`;
      const lines = doc.splitTextToSize(label, 170);
      doc.text(lines, 18, yPos + 8);
      yPos += 10;
    });

    doc.save('relatorio-sss.pdf');
    showToast('PDF exportado com sucesso!', 'success');
  } catch (error) {
    console.error('Erro ao exportar PDF:', error);
    showToast('Não foi possível gerar o relatório em PDF.', 'error');
  }
}

function setPresencaStatus(value, form) {
  if (!form) return;
  form.dataset.presente = String(value);

  form.querySelectorAll('.status-btn').forEach((button) => {
    const active = button.dataset.presente === String(value);
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

function formatLocalDateInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getMostRecentSunday() {
  const sunday = new Date();
  sunday.setHours(0, 0, 0, 0);
  sunday.setDate(sunday.getDate() - sunday.getDay());
  return formatLocalDateInput(sunday);
}

function isSundayDate(value) {
  if (!value) return false;
  const date = new Date(`${value}T00:00:00`);
  return !Number.isNaN(date.getTime()) &&
    date.getDay() === 0 &&
    formatLocalDateInput(date) === value;
}

function bindPresenceForm() {
  const forms = [document.querySelector('#frequenciaForm'), document.querySelector('#frequenciaFormSection')];

  forms.forEach((form) => {
    if (!form) return;

    setPresencaStatus(true, form);

    const dateInput = form.querySelector('.attendance-date');
    if (dateInput) {
      dateInput.value = getMostRecentSunday();
      dateInput.addEventListener('change', () => {
        dateInput.setCustomValidity(isSundayDate(dateInput.value)
          ? ''
          : 'Selecione um domingo para registrar a frequência da EBD.');
      });
    }

    const studentSelect = form.querySelector('.attendance-student');
    const classSelect = form.querySelector('.attendance-class');
    studentSelect?.addEventListener('change', () => {
      const selectedOption = studentSelect.selectedOptions[0];
      const studentClassId = selectedOption?.dataset.classeId;
      if (classSelect && studentClassId) {
        classSelect.value = studentClassId;
      }
    });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();

      const alunoId = Number(form.querySelector('.attendance-student')?.value || 0);
      const classeId = Number(form.querySelector('.attendance-class')?.value || 0);
      const dataAula = dateInput?.value || '';

      if (!alunoId || !classeId) {
        showToast('Selecione aluno e turma para registrar presença.', 'error');
        return;
      }

      if (!isSundayDate(dataAula)) {
        showToast('Selecione um domingo para registrar a frequência da EBD.', 'error');
        dateInput?.focus();
        return;
      }

      const payload = {
        aluno_id: alunoId,
        classe_id: classeId,
        presente: form.dataset.presente === 'true',
        data_aula: dataAula,
      };

      try {
        const response = await savePresenca(payload);
        showToast(payload.presente ? 'Presença registrada com sucesso!' : 'Falta registrada com sucesso!', 'success');
        form.reset();
        if (dateInput) dateInput.value = getMostRecentSunday();
        setPresencaStatus(true, form);
        const reportStudentSelect = document.querySelector('#alunoRelatorioSelect');
        const reportNameInput = document.querySelector('#relatorioAlunoNome');
        if (reportStudentSelect) reportStudentSelect.value = String(alunoId);
        if (reportNameInput) reportNameInput.value = '';
        await Promise.all([
          loadDashboardStats(),
          loadAlunos(),
          loadRelatorioClasseData(),
          loadRelatorioGeralData(),
          loadRelatorioTrimestreData(Number(document.querySelector('#trimestreRelatorioSelect')?.value || 1)),
          loadRelatorioAlunoData(),
        ]);
        activateSection('frequencia');
        return response;
      } catch (error) {
        console.error('Erro ao registrar presença:', error);
        showToast(error.message || 'Não foi possível salvar presença.', 'error');
      }
    });
  });
}

function bindAlunoEditForm() {
  const form = document.querySelector('#editAlunoForm');
  if (!form) return;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const alunoId = Number(form.dataset.alunoId || 0);
    const nome = document.querySelector('#editAlunoNome')?.value.trim();
    const idade = Number(document.querySelector('#editAlunoIdade')?.value || 0);
    const classeId = Number(document.querySelector('#editAlunoTurma')?.value || 0);
    const cargo = document.querySelector('#editAlunoCargo')?.value || 'Membro';

    if (!alunoId || !nome || !classeId || !Number.isInteger(idade) || idade < 0 || !cargo) {
      showToast('Preencha nome, idade, turma e cargo corretamente.', 'error');
      return;
    }

    try {
      await updateAluno(alunoId, { nome, idade, classe_id: classeId, cargo });
      showToast('Aluno atualizado com sucesso!', 'success');

      const modalElement = document.querySelector('#editAlunoModal');
      const modal = window.bootstrap ? window.bootstrap.Modal.getInstance(modalElement) : null;
      if (modal) modal.hide();
      form.reset();

      await Promise.all([loadDashboardStats(), loadAlunos()]);
    } catch (error) {
      console.error('Erro ao atualizar aluno:', error);
      showToast(error.message || 'Não foi possível atualizar o aluno.', 'error');
    }
  });
}

function bindNewAlunoForm() {
  const form = document.querySelector('#newAlunoForm');
  if (!form) return;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const nome = document.querySelector('#newAlunoNome')?.value.trim();
    const idade = Number(document.querySelector('#newAlunoIdade')?.value || 0);
    const classeId = Number(document.querySelector('#newAlunoTurma')?.value || 0);
    const cargo = document.querySelector('#newAlunoCargo')?.value || 'Membro';

    if (!nome || !Number.isInteger(idade) || idade < 0 || !classeId || !cargo) {
      showToast('Preencha nome, idade, turma e cargo antes de salvar.', 'error');
      return;
    }

    try {
      await createAluno({ nome, idade, classe_id: classeId, cargo });
      showToast('Aluno cadastrado com sucesso!', 'success');
      form.reset();
      const modalElement = document.querySelector('#newAlunoModal');
      const modal = window.bootstrap ? window.bootstrap.Modal.getInstance(modalElement) : null;
      if (modal) modal.hide();
      await Promise.all([loadDashboardStats(), loadAlunos()]);
    } catch (error) {
      console.error('Erro ao cadastrar aluno:', error);
      showToast(error.message || 'Não foi possível cadastrar o aluno.', 'error');
    }
  });
}

function bindNewClasseForm() {
  const form = document.querySelector('#newClasseForm');
  if (!form) return;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const nomeClasse = document.querySelector('#newClasseNome')?.value.trim();
    if (!nomeClasse) {
      showToast('Digite o nome da turma.', 'error');
      return;
    }

    try {
      await createClasse({ nome_classe: nomeClasse });
      showToast('Turma cadastrada com sucesso!', 'success');
      form.reset();
      const modalElement = document.querySelector('#newClasseModal');
      const modal = window.bootstrap ? window.bootstrap.Modal.getInstance(modalElement) : null;
      if (modal) modal.hide();
      await loadClasses();
    } catch (error) {
      console.error('Erro ao cadastrar turma:', error);
      showToast(error.message || 'Não foi possível cadastrar a turma.', 'error');
    }
  });
}

function bindNewUsuarioForm() {
  const form = document.querySelector('#newUsuarioForm');
  if (!form) return;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const nome = document.querySelector('#newUsuarioNome')?.value.trim();
    const login = document.querySelector('#newUsuarioLogin')?.value.trim();
    const senha = document.querySelector('#newUsuarioSenha')?.value;
    const nivelPerfil = document.querySelector('#newUsuarioPerfil')?.value;

    if (!nome || !login || !senha || !nivelPerfil) {
      showToast('Preencha todos os campos do perfil antes de salvar.', 'error');
      return;
    }

    try {
      await createUsuario({ nome, login, senha, nivel_perfil: nivelPerfil });
      showToast('Perfil cadastrado com sucesso!', 'success');
      form.reset();
      const modalElement = document.querySelector('#newUsuarioModal');
      const modal = window.bootstrap ? window.bootstrap.Modal.getInstance(modalElement) : null;
      if (modal) modal.hide();
      await loadUsuarios();
    } catch (error) {
      console.error('Erro ao cadastrar usuário:', error);
      showToast(error.message || 'Não foi possível cadastrar o perfil.', 'error');
    }
  });
}

function bindStatusButtons() {
  document.querySelectorAll('.status-btn').forEach((button) => {
    button.addEventListener('click', () => {
      setPresencaStatus(button.dataset.presente === 'true', button.closest('form'));
    });
  });
}

function bindCargoForm() {
  const form = document.querySelector('#cargoForm');
  if (!form) return;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const cargoId = document.querySelector('#cargoId')?.value || '';
    const nome = document.querySelector('#cargoNome')?.value.trim() || '';

    if (!nome) {
      showToast('Informe o nome do cargo.', 'error');
      return;
    }

    try {
      if (cargoId) {
        await updateCargo(Number(cargoId), { nome });
        showToast('Cargo atualizado com sucesso!', 'success');
      } else {
        await createCargo({ nome });
        showToast('Cargo cadastrado com sucesso!', 'success');
      }

      form.reset();
      document.querySelector('#cargoId').value = '';
      await loadCargos();
      await loadAlunos();
    } catch (error) {
      console.error('Erro ao salvar cargo:', error);
      showToast(error.message || 'Não foi possível salvar o cargo.', 'error');
    }
  });
}

function populateRelatorioSelects(alunos, classes) {
  const alunoSelect = document.querySelector('#alunoRelatorioSelect');
  const classeSelect = document.querySelector('#classeRelatorioSelect');

  if (alunoSelect) {
    const options = ['<option value="">Selecione o aluno</option>']
      .concat(
        (alunos || []).map((aluno) => `<option value="${aluno.id}">${aluno.nome}</option>`),
      )
      .join('');
    alunoSelect.innerHTML = options;
  }

  if (classeSelect) {
    const options = ['<option value="">Selecione a turma</option>']
      .concat(
        (classes || []).map((classe) => `<option value="${classe.id}">${classe.nome_classe}</option>`),
      )
      .join('');
    classeSelect.innerHTML = options;
  }
}

async function loadRelatorioAlunoData() {
  const alunoSelect = document.querySelector('#alunoRelatorioSelect');
  const nomeInput = document.querySelector('#relatorioAlunoNome');
  const alunoId = Number(alunoSelect?.value || 0);
  const nomeBusca = nomeInput?.value.trim() || '';

  try {
    if (alunoId) {
      const report = await getRelatorioAluno(alunoId);
      renderRelatorioAluno(report);
      return;
    }

    if (nomeBusca) {
      const report = await getRelatorioAlunoPorNome(nomeBusca);
      renderRelatorioAluno(report);
      return;
    }

    const alunos = await getAlunos();
    if (alunos.length > 0) {
      const report = await getRelatorioAluno(alunos[0].id);
      renderRelatorioAluno(report);
      if (alunoSelect) alunoSelect.value = String(alunos[0].id);
    } else {
      renderRelatorioAluno(null);
    }
  } catch (error) {
    console.error('Erro ao carregar relatório do aluno:', error);
    renderRelatorioAluno(null);
    showToast(error.message || 'Não foi possível carregar o relatório do aluno.', 'error');
  }
}

async function loadRelatorioClasseData() {
  const classeSelect = document.querySelector('#classeRelatorioSelect');
  const classeId = Number(classeSelect?.value || 0);

  try {
    if (!classeSelect) {
      renderRelatorioClasse(null);
      return;
    }

    if (!classeId) {
      const classes = await getClasses();
      if (classes.length > 0) {
        classeSelect.value = String(classes[0].id);
        const report = await getRelatorioClasse(classes[0].id);
        renderRelatorioClasse(report);
        return;
      }

      renderRelatorioClasse(null);
      return;
    }

    const report = await getRelatorioClasse(classeId);
    renderRelatorioClasse(report);
  } catch (error) {
    console.error('Erro ao carregar relatório da turma:', error);
    renderRelatorioClasse(null);
    showToast(error.message || 'Não foi possível carregar o relatório da turma.', 'error');
  }
}

async function loadRelatorioGeralData() {
  try {
    const report = await getRelatorioGeral();
    renderRelatorioGeral(report);
  } catch (error) {
    console.error('Erro ao carregar relatório geral:', error);
    renderRelatorioGeral(null);
    showToast(error.message || 'Não foi possível carregar o relatório geral.', 'error');
  }
}

function bindRelatorioControls() {
  const alunoSelect = document.querySelector('#alunoRelatorioSelect');
  const alunoInput = document.querySelector('#relatorioAlunoNome');
  const alunoButton = document.querySelector('#btnBuscarRelatorioAluno');
  const classeSelect = document.querySelector('#classeRelatorioSelect');
  const trimestreSelect = document.querySelector('#trimestreRelatorioSelect');

  if (alunoButton) {
    alunoButton.addEventListener('click', loadRelatorioAlunoData);
  }

  if (alunoInput) {
    alunoInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        loadRelatorioAlunoData();
      }
    });
  }

  if (alunoSelect) {
    alunoSelect.addEventListener('change', () => {
      if (alunoSelect.value) {
        const nomeInput = document.querySelector('#relatorioAlunoNome');
        if (nomeInput) nomeInput.value = '';
      }
      loadRelatorioAlunoData();
    });
  }

  if (classeSelect) {
    classeSelect.addEventListener('change', loadRelatorioClasseData);
  }

  if (trimestreSelect) {
    trimestreSelect.addEventListener('change', () => {
      const trimestre = Number(trimestreSelect.value || 1);
      loadRelatorioTrimestreData(trimestre);
    });
  }
}

function renderRelatorioTrimestre(report) {
  const resumo = document.querySelector('#trimestreRelatorioResumo');
  if (!resumo) return;

  if (!report || !report.resumo) {
    resumo.innerHTML = '<div class="alert alert-light mb-0">Nenhum dado disponível para este trimestre.</div>';
    return;
  }

  const media = Number(report.resumo.mediaGeral ?? 0);
  const statusClass = media >= 75 ? 'success' : 'danger';
  const statusLabel = media >= 75 ? 'Regular' : 'Atenção';

  resumo.innerHTML = `
    <div class="row g-3">
      <div class="col-md-3">
        <div class="border rounded p-3 h-100 bg-light-subtle">
          <small class="text-muted">Período</small>
          <div class="fw-semibold">${report.period_label || 'Trimestre'}</div>
        </div>
      </div>
      <div class="col-md-3">
        <div class="border rounded p-3 h-100 bg-light-subtle">
          <small class="text-muted">Total de alunos</small>
          <div class="fs-4 fw-bold">${report.resumo.totalAlunos ?? 0}</div>
        </div>
      </div>
      <div class="col-md-3">
        <div class="border rounded p-3 h-100 bg-light-subtle">
          <small class="text-muted">Presenças</small>
          <div class="fs-4 fw-bold">${report.resumo.totalPresencas ?? 0}</div>
        </div>
      </div>
      <div class="col-md-3">
        <div class="border rounded p-3 h-100 bg-light-subtle">
          <small class="text-muted">Média geral</small>
          <div class="fs-4 fw-bold text-${statusClass}">${formatPercent(media)}</div>
          <span class="badge bg-${statusClass}">${statusLabel}</span>
        </div>
      </div>
    </div>
  `;
}

async function loadRelatorioTrimestreData(trimestre = 1) {
  try {
    const report = await getRelatorioTrimestre(Number(trimestre) || 1);
    renderRelatorioTrimestre(report);
  } catch (error) {
    console.error('Erro ao carregar relatório por trimestre:', error);
    renderRelatorioTrimestre(null);
    showToast(error.message || 'Não foi possível carregar o relatório do trimestre.', 'error');
  }
}

async function initialize() {
  renderLogos();
  bindAuthControls();
  bindStatusButtons();
  bindPresenceForm();
  bindAlunoEditForm();
  bindNewAlunoForm();
  bindNewClasseForm();
  bindNewUsuarioForm();
  bindNewAgendaForm();
  bindEditAgendaForm();
  bindCargoForm();
  bindRelatorioControls();

  const exportButton = document.querySelector('#btnExportPdf');
  const exportButtonRelatorio = document.querySelector('#btnExportPdfRelatorio');

  if (exportButton) {
    exportButton.addEventListener('click', exportDashboardPdf);
  }

  if (exportButtonRelatorio) {
    exportButtonRelatorio.addEventListener('click', exportDashboardPdf);
  }

  renderAuthState();
  if (!localStorage.getItem('sssToken')) {
    activateSection('dashboard');
    return null;
  }

  activateSection('dashboard');

  const [stats, alunos, classes, usuarios, agendas, cargos] = await Promise.all([
    loadDashboardStats(),
    loadAlunos(),
    loadClasses(),
    loadUsuarios(),
    loadAgendas(),
    loadCargos(),
  ]);

  populateRelatorioSelects(alunos || [], classes || []);
  await Promise.all([
    loadRelatorioAlunoData(),
    loadRelatorioClasseData(),
    loadRelatorioGeralData(),
    loadRelatorioTrimestreData(Number(document.querySelector('#trimestreRelatorioSelect')?.value || 1)),
  ]);

  return { stats, alunos, classes, usuarios, agendas };
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}
