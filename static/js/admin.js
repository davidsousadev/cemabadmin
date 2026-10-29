(function () {
    'use strict';
    const $ = id => document.getElementById(id);
    let adminToken = '';
    let alunos = [];

    const TITLES = {
        overview: 'Visão Geral',
        absences: 'Notificar Faltas',
        custom: 'Avisos Personalizados',
        students: 'Gestão de Alunos',
        families: 'Gestão de Famílias',
        version: 'Versão do Aplicativo',
        history: 'Histórico de Envios'
    };

    // Data padrão: hoje
    const hoje = new Date().toISOString().slice(0, 10);
    $('overviewDate').value = hoje;
    $('absenceDate').value = hoje;

    // ==============================================
    // FUNÇÕES AUXILIARES
    // ==============================================
    function showMsg(el, texto, isError = false) {
        el.hidden = false;
        el.textContent = texto;
        el.classList.toggle('error', isError);
    }

    function hideMsg(el) {
        el.hidden = true;
    }

    async function apiFetch(caminho, opcoes = {}) {
        const cabecalhos = {
            'Content-Type': 'application/json',
            'X-Admin-Token': adminToken
        };

        const res = await fetch(caminho, {
            ...opcoes,
            headers: cabecalhos
        });

        const dados = await res.json();
        if (!res.ok) throw new Error(dados.detail || `Erro ${res.status}`);
        return dados;
    }

    function trocarVisualizacao(nomeView) {
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.view === nomeView);
        });
        document.querySelectorAll('.view').forEach(v => {
            v.classList.toggle('active', v.id === `view-${nomeView}`);
        });
        $('topTitle').textContent = TITLES[nomeView];
        $('crumb').textContent = nomeView.toUpperCase();
    }

    function alunosFiltrados() {
        const texto = ($('filterStudentText')?.value || '').trim().toLowerCase();
        const fam = ($('filterStudentFamily')?.value || '').trim();
        const status = ($('filterStudentStatus')?.value || '').trim();
        return alunos.filter(a => {
            if (texto && !(`${a.matricula} ${a.nome_completo}`.toLowerCase().includes(texto))) return false;
            if (fam && String(a.familia_id || '') !== fam) return false;
            if (status && String(!!a.ativo) !== status) return false;
            return true;
        });
    }

    function renderTabelaAlunos(lista) {
        const wrap = $('studentsTable');
        if (!wrap) return;
        if (!lista.length) {
            wrap.innerHTML = '<div class="empty">Nenhum aluno encontrado.</div>';
            return;
        }
        wrap.innerHTML = `
            <table>
                <thead>
                    <tr>
                        <th>Matrícula</th>
                        <th>Nome</th>
                        <th>Ativo</th>
                        <th>Família</th>
                        <th>Ações</th>
                    </tr>
                </thead>
                <tbody>
                    ${lista.map(a => `
                        <tr>
                            <td>${a.matricula}</td>
                            <td>${a.nome_completo}</td>
                            <td>${a.ativo ? 'Sim' : 'Não'}</td>
                            <td>${a.familia_id || '—'}</td>
                            <td>
                                <button class="btn btn-light" data-edit="${a.matricula}">Editar</button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
        wrap.querySelectorAll('[data-edit]').forEach(btn => {
            btn.addEventListener('click', () => {
                const a = alunos.find(x => x.matricula === btn.dataset.edit);
                if (!a) return;
                $('studentMatricula').value = a.matricula;
                $('studentNome').value = a.nome_completo;
                $('studentAtivo').value = a.ativo ? 'true' : 'false';
                $('studentFamilia').value = a.familia_id || '';
            });
        });
    }

    function renderFamilias() {
        const wrap = $('familiesTable');
        if (!wrap) return;
        const grupos = {};
        alunos.forEach(a => {
            const key = a.familia_id || 'Sem família';
            (grupos[key] = grupos[key] || []).push(a);
        });
        const keys = Object.keys(grupos).sort();
        if (!keys.length) {
            wrap.innerHTML = '<div class="empty">Nenhuma família cadastrada.</div>';
            return;
        }
        wrap.innerHTML = keys.map(key => `
            <div class="card" style="margin:0 0 12px">
                <strong>Família ${key}</strong>
                <ul>${grupos[key].map(a => `<li>${a.nome_completo} (${a.matricula})</li>`).join('')}</ul>
            </div>
        `).join('');
    }

    async function carregarListaAlunos() {
        alunos = (await apiFetch('/api/alunos')).alunos || [];
        const sel = $('studentSelect');
        if (sel) {
            sel.innerHTML = '';
            alunos.forEach(a => {
                const opt = document.createElement('option');
                opt.value = a.matricula;
                opt.textContent = `${a.nome_completo} (${a.matricula})`;
                sel.appendChild(opt);
            });
        }
        filtrarAlunosPersonalizados();

        renderTabelaAlunos(alunosFiltrados());
        renderFamilias();

        // Select de irmãos
        const sib = $('siblingsSelect');
        if (sib) {
            sib.innerHTML = '';
            alunos.forEach(a => {
                const opt = document.createElement('option');
                opt.value = a.matricula;
                opt.textContent = `${a.nome_completo} (${a.matricula})${a.familia_id ? ' [Fam. ' + a.familia_id + ']' : ''}`;
                sib.appendChild(opt);
            });
        }
    }

    function alunosPersonalizadosFiltrados() {
        const busca = ($('customStudentSearch') && $('customStudentSearch').value || '').trim().toLowerCase();
        if (!busca) return alunos;
        return alunos.filter(a => (a.nome_completo + ' ' + a.matricula).toLowerCase().includes(busca));
    }
    function filtrarAlunosPersonalizados() {
        const sel = $('studentSelect');
        if (!sel) return;
        const visiveis = new Set(alunosPersonalizadosFiltrados().map(a => a.matricula));
        Array.from(sel.options).forEach(opt => { opt.hidden = !visiveis.has(opt.value); });
    }

    // ==============================================
    // GESTÃO DE ALUNOS
    // ==============================================
    $('saveStudent').addEventListener('click', async () => {
        const feedback = $('studentFeedback');
        hideMsg(feedback);
        const matricula = $('studentMatricula').value.trim();
        const nome = $('studentNome').value.trim();
        if (!matricula || !nome) {
            return showMsg(feedback, 'Informe matrícula e nome.', true);
        }
        const ativo = $('studentAtivo').value === 'true';
        const familiaRaw = $('studentFamilia').value.trim();
        const dados = { matricula, nome_completo: nome, ativo };
        if (familiaRaw) dados.familia_id = parseInt(familiaRaw, 10);

        const btn = $('saveStudent');
        btn.disabled = true;
        btn.textContent = 'Salvando...';
        try {
            await apiFetch('/api/alunos/atualizar', {
                method: 'POST',
                body: JSON.stringify(dados)
            });
            showMsg(feedback, '✅ Aluno salvo com sucesso!', false);
            await carregarListaAlunos();
        } catch (err) {
            showMsg(feedback, `Erro: ${err.message}`, true);
        } finally {
            btn.disabled = false;
            btn.textContent = 'Salvar Aluno';
        }
    });

    $('clearStudent').addEventListener('click', () => {
        $('studentMatricula').value = '';
        $('studentNome').value = '';
        $('studentAtivo').value = 'true';
        $('studentFamilia').value = '';
        hideMsg($('studentFeedback'));
    });

    $('associateSiblings').addEventListener('click', async () => {
        const feedback = $('siblingsFeedback');
        hideMsg(feedback);
        const select = $('siblingsSelect');
        const matriculas = Array.from(select.selectedOptions).map(o => o.value);
        if (matriculas.length < 2) {
            return showMsg(feedback, 'Selecione ao menos dois alunos.', true);
        }
        const familiaRaw = $('siblingsFamilia').value.trim();
        const corpo = { matriculas };
        if (familiaRaw) corpo.familia_id = parseInt(familiaRaw, 10);

        const btn = $('associateSiblings');
        btn.disabled = true;
        btn.textContent = 'Associando...';
        try {
            const res = await apiFetch('/api/alunos/associar-irmaos', {
                method: 'POST',
                body: JSON.stringify(corpo)
            });
            showMsg(feedback, `✅ Irmãos associados à família ${res.familia_id}.`, false);
            await carregarListaAlunos();
        } catch (err) {
            showMsg(feedback, `Erro: ${err.message}`, true);
        } finally {
            btn.disabled = false;
            btn.textContent = 'Associar Irmãos';
        }
    });

    $('refreshStudents').addEventListener('click', () => carregarListaAlunos().catch(err => showMsg($('studentFeedback'), err.message, true)));
    const cs=$('customStudentSearch'); if(cs) cs.addEventListener('input', filtrarAlunosPersonalizados);
    const sa=$('selectAllFilteredStudents'); if(sa) sa.addEventListener('click', () => { alunosPersonalizadosFiltrados().forEach(a=>{const o=[...$('studentSelect').options].find(x=>x.value===a.matricula); if(o) o.selected=true;}); });
    const cl=$('clearSelectedStudents'); if(cl) cl.addEventListener('click', () => { [...$('studentSelect').options].forEach(o=>o.selected=false); });
    ['filterStudentText','filterStudentFamily','filterStudentStatus'].forEach(id => { const el=$(id); if(el) el.addEventListener('input', () => renderTabelaAlunos(alunosFiltrados())); });

    const studentsObserver = new MutationObserver(() => {
        if ($('view-students').classList.contains('active')) carregarListaAlunos().catch(() => {});
    });
    studentsObserver.observe($('view-students'), { attributes: true, attributeFilter: ['class'] });
    const familiesObserver = new MutationObserver(() => { if ($('view-families').classList.contains('active')) { carregarListaAlunos().catch(()=>{}); } });
    familiesObserver.observe($('view-families'), { attributes: true, attributeFilter: ['class'] });
    const rf=$('refreshFamilies'); if(rf) rf.addEventListener('click', () => carregarListaAlunos().catch(err=>showMsg($('siblingsFeedback'), err.message, true)));


    // ==============================================
    $('connectButton').addEventListener('click', async () => {
        const token = $('adminToken').value.trim();
        if (!token) return showMsg($('loginMessage'), 'Informe o token administrativo.', true);

        adminToken = token;
        try {
            await apiFetch('/api/app-version');
            $('loginView').hidden = true;
            $('dashboard').hidden = false;
            await carregarListaAlunos();
            await atualizarResumo();
        } catch (err) {
            adminToken = '';
            showMsg($('loginMessage'), err.message, true);
        }
    });

    // ==============================================
    // NAVEGAÇÃO
    // ==============================================
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => trocarVisualizacao(btn.dataset.view));
    });

    document.querySelectorAll('[data-jump]').forEach(btn => {
        btn.addEventListener('click', () => trocarVisualizacao(btn.dataset.jump));
    });

    // ==============================================
    // VISÃO GERAL
    // ==============================================
    async function atualizarResumo() {
        const data = $('overviewDate').value;
        const res = await apiFetch(`/api/resumo?data=${encodeURIComponent(data)}`);

        $('mStudents').textContent = res.alunos_ativos;
        $('mPresent').textContent = res.presentes;
        $('mAbsences').textContent = res.faltas_calculadas;
        $('mSent').textContent = res.faltas_ja_notificadas;

        const porcentagemPresentes = res.alunos_ativos ? Math.round((res.presentes / res.alunos_ativos) * 100) : 0;
        const porcentagemAusentes = 100 - porcentagemPresentes;

        $('coveragePresent').textContent = `${porcentagemPresentes}%`;
        $('coverageAbsence').textContent = `${porcentagemAusentes}%`;
        $('coverageBar').style.width = `${porcentagemPresentes}%`;
        $('absenceBar').style.width = `${porcentagemAusentes}%`;
    }

    $('refreshOverview').addEventListener('click', atualizarResumo);

    // ==============================================
    // NOTIFICAR FALTAS
    // ==============================================
    async function atualizarResumoFaltas() {
        const data = $('absenceDate').value;
        const res = await apiFetch(`/api/resumo?data=${encodeURIComponent(data)}`);
        showMsg($('absenceFeedback'),
            `📊 ${res.alunos_ativos} alunos | ${res.presentes} presentes | ${res.faltas_calculadas} faltas | ${res.faltas_ja_notificadas} já notificadas`,
            false
        );
    }

    $('refreshAbsences').addEventListener('click', atualizarResumoFaltas);

    $('sendAbsences').addEventListener('click', async () => {
        const btn = $('sendAbsences');
        const feedback = $('absenceFeedback');
        hideMsg(feedback);

        const dados = {
            data: $('absenceDate').value,
            titulo: $('absenceTitle').value.trim(),
            mensagem: $('absenceMessage').value.trim()
        };

        if (!dados.data || !dados.titulo || !dados.mensagem) {
            return showMsg(feedback, 'Preencha todos os campos.', true);
        }

        btn.disabled = true;
        btn.textContent = 'Enviando...';
        try {
            const res = await apiFetch('/api/faltas/enviar', {
                method: 'POST',
                body: JSON.stringify(dados)
            });
            showMsg(feedback,
                `✅ Concluído!\nFaltas identificadas: ${res.faltas_identificadas}\nNotificações enviadas: ${res.notificacoes_enviadas}\nAlunos notificados: ${res.alunos_notificados}\nSem vínculo com app: ${res.sem_vinculo}`,
                false
            );
            await atualizarResumo();
        } catch (err) {
            showMsg(feedback, `Erro: ${err.message}`, true);
        } finally {
            btn.disabled = false;
            btn.textContent = 'Enviar Notificações';
        }
    });

    // ==============================================
    // AVISOS PERSONALIZADOS
    // ==============================================
    $('customTarget').addEventListener('change', () => {
        const ehAluno = $('customTarget').value === 'aluno';
        $('studentSelectWrap').hidden = !ehAluno;
    });

    $('sendCustom').addEventListener('click', async () => {
        const btn = $('sendCustom');
        const feedback = $('customFeedback');
        hideMsg(feedback);

        const destino = $('customTarget').value;
        const titulo = $('customTitle').value.trim();
        const mensagem = $('customBody').value.trim();
        if (!titulo || !mensagem) {
            return showMsg(feedback, 'Preencha título e mensagem.', true);
        }
        const selecionados = destino === 'aluno' ? [...$('studentSelect').selectedOptions].map(o => o.value).filter(Boolean) : [];
        if (destino === 'aluno' && !selecionados.length) {
            return showMsg(feedback, 'Selecione ao menos um aluno.', true);
        }

        btn.disabled = true;
        btn.textContent = 'Enviando...';
        try {
            let totalAlvos = 0, totalNotificados = 0, totalSemVinculo = 0;
            const listaEnvio = destino === 'aluno' ? selecionados : [null];
            for (const mat of listaEnvio) {
                const dados = { destino, titulo, mensagem, matricula: mat };
                const res = await apiFetch('/api/personalizada/enviar', {
                    method: 'POST',
                    body: JSON.stringify(dados)
                });
                totalAlvos += res.alunos_alvo || 0;
                totalNotificados += res.alunos_notificados || 0;
                totalSemVinculo += res.sem_vinculo || 0;
            }
            showMsg(feedback,
                `✅ Enviado!
Alvos: ${totalAlvos}
Notificados: ${totalNotificados}
Sem vínculo: ${totalSemVinculo}`,
                false
            );
            $('customTitle').value = '';
            $('customBody').value = '';
        } catch (err) {
            showMsg(feedback, `Erro: ${err.message}`, true);
        } finally {
        }
    });

    $('clearCustom').addEventListener('click', () => {
        $('customTitle').value = '';
        $('customBody').value = '';
        $('studentSelect').value = '';
        hideMsg($('customFeedback'));
    });

    // ==============================================
    // VERSÃO DO APLICATIVO
    // ==============================================
    async function carregarVersao() {
        const res = await apiFetch('/api/app-version');
        $('appVersion').value = res.version || '';
        $('downloadUrl').value = res.download_url || '';
        $('releaseNotes').value = res.release_notes || '';
        showMsg($('versionFeedback'), 'Versão carregada com sucesso.', false);
    }

    $('loadVersion').addEventListener('click', carregarVersao);

    $('saveVersion').addEventListener('click', async () => {
        const btn = $('saveVersion');
        const feedback = $('versionFeedback');
        hideMsg(feedback);

        const dados = {
            version: $('appVersion').value.trim(),
            download_url: $('downloadUrl').value.trim(),
            release_notes: $('releaseNotes').value.trim()
        };

        if (!dados.version) {
            return showMsg(feedback, 'Informe a versão.', true);
        }

        btn.disabled = true;
        btn.textContent = 'Salvando...';
        try {
            await apiFetch('/api/app-version', {
                method: 'PUT',
                body: JSON.stringify(dados)
            });
            showMsg(feedback, '✅ Versão atualizada com sucesso!', false);
        } catch (err) {
            showMsg(feedback, `Erro: ${err.message}`, true);
        } finally {
            btn.disabled = false;
            btn.textContent = 'Salvar';
        }
    });

    // ==============================================
    // HISTÓRICO
    // ==============================================
    async function carregarHistorico() {
        const res = await apiFetch('/api/historico?limite=100');
        const wrap = $('historyTable');

        if (!res.notificacoes || res.notificacoes.length === 0) {
            wrap.innerHTML = '<div class="empty">Nenhum registro encontrado.</div>';
            return;
        }

        wrap.innerHTML = `
            <table>
                <thead>
                    <tr>
                        <th>Data</th>
                        <th>Tipo</th>
                        <th>Título</th>
                        <th>Aluno</th>
                        <th>Enviado</th>
                    </tr>
                </thead>
                <tbody>
                    ${res.notificacoes.map(n => `
                        <tr>
                            <td>${n.criado_em ? new Date(n.criado_em).toLocaleDateString('pt-BR') : '—'}</td>
                            <td>${n.tipo === 'falta' ? 'Falta' : 'Aviso'}</td>
                            <td>${n.titulo}</td>
                            <td>${n.nome_completo || n.matricula || 'Todos'}</td>
                            <td>${n.tokens_enviados || 0}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }

    $('refreshHistory').addEventListener('click', carregarHistorico);

    // Atualiza histórico automaticamente ao abrir a aba
    const observer = new MutationObserver(() => {
        if ($('view-history').classList.contains('active')) carregarHistorico();
    });
    observer.observe($('view-history'), { attributes: true, attributeFilter: ['class'] });

})();