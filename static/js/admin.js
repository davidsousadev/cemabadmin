(function () {
    'use strict';
    const $ = id => document.getElementById(id);
    let adminToken = '';
    let alunos = [];

    const TITLES = {
        overview: 'Visão Geral',
        absences: 'Notificar Faltas',
        custom: 'Avisos Personalizados',
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

    async function carregarListaAlunos() {
        alunos = (await apiFetch('/api/alunos')).alunos || [];
        const sel = $('studentSelect');
        sel.innerHTML = '<option value="">Selecione...</option>';
        alunos.forEach(a => {
            const opt = document.createElement('option');
            opt.value = a.matricula;
            opt.textContent = `${a.nome_completo} (${a.matricula})`;
            sel.appendChild(opt);
        });
    }

    // ==============================================
    // LOGIN / AUTENTICAÇÃO
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
        const dados = {
            destino,
            titulo: $('customTitle').value.trim(),
            mensagem: $('customBody').value.trim(),
            matricula: destino === 'aluno' ? $('studentSelect').value : null
        };

        if (!dados.titulo || !dados.mensagem) {
            return showMsg(feedback, 'Preencha título e mensagem.', true);
        }
        if (destino === 'aluno' && !dados.matricula) {
            return showMsg(feedback, 'Selecione o aluno.', true);
        }

        btn.disabled = true;
        btn.textContent = 'Enviando...';
        try {
            const res = await apiFetch('/api/personalizada/enviar', {
                method: 'POST',
                body: JSON.stringify(dados)
            });
            showMsg(feedback,
                `✅ Enviado!\nAlvos: ${res.alunos_alvo}\nNotificados: ${res.alunos_notificados}\nSem vínculo: ${res.sem_vinculo}`,
                false
            );
            $('customTitle').value = '';
            $('customBody').value = '';
        } catch (err) {
            showMsg(feedback, `Erro: ${err.message}`, true);
        } finally {
            btn.disabled = false;
            btn.textContent = 'Enviar';
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