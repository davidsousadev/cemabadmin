# -*- coding: utf-8 -*-
"""Painel Administrativo CEMAB — Consumindo API Externa"""
from datetime import date, datetime, timezone
import re
from urllib.parse import urlparse
from zoneinfo import ZoneInfo

import requests
from decouple import config
from flask import Flask, Blueprint, request, jsonify, render_template

# ====================== CONFIGURAÇÕES ======================
ALUNOS_ADMIN_TOKEN = config("ALUNOS_ADMIN_TOKEN", default="").strip()
FUSO = ZoneInfo(config("FUSO_HORARIO", default="America/Fortaleza"))
API_BASE_URL = config("API_BASE_URL", default="https://apicemab.vercel.app").rstrip("/")

TEMPO_TIMEOUT = 30  # segundos
# ===========================================================

app = Flask(__name__)
admin_bp = Blueprint("admin", __name__, url_prefix="")


# ---------------------- FUNÇÕES AUXILIARES ----------------------
def _api_caminho(caminho: str) -> str:
    """Monta URL completa da API."""
    return f"{API_BASE_URL}{caminho}"


def _api_get(caminho: str, params=None):
    """Faz requisição GET autenticada para a API."""
    headers = {"X-Admin-Token": ALUNOS_ADMIN_TOKEN}
    resp = requests.get(
        _api_caminho(caminho),
        headers=headers,
        params=params or {},
        timeout=TEMPO_TIMEOUT
    )
    resp.raise_for_status()
    return resp.json()


def _api_post(caminho: str, dados: dict):
    """Faz requisição POST autenticada para a API."""
    headers = {
        "X-Admin-Token": ALUNOS_ADMIN_TOKEN,
        "Content-Type": "application/json"
    }
    resp = requests.post(
        _api_caminho(caminho),
        headers=headers,
        json=dados,
        timeout=TEMPO_TIMEOUT
    )
    resp.raise_for_status()
    return resp.json()


def _api_put(caminho: str, dados: dict):
    """Faz requisição PUT autenticada para a API."""
    headers = {
        "X-Admin-Token": ALUNOS_ADMIN_TOKEN,
        "Content-Type": "application/json"
    }
    resp = requests.put(
        _api_caminho(caminho),
        headers=headers,
        json=dados,
        timeout=TEMPO_TIMEOUT
    )
    resp.raise_for_status()
    return resp.json()


def tratar_erro_api(funcao):
    """Decorador para capturar erros de comunicação com a API."""
    def embrulhar(*args, **kwargs):
        try:
            return funcao(*args, **kwargs)
        except requests.exceptions.HTTPError as e:
            try:
                detalhe = e.response.json().get("detail", str(e))
            except Exception:
                detalhe = f"Erro na API: {str(e)}"
            return jsonify({"detail": detalhe}), e.response.status_code
        except requests.exceptions.RequestException as e:
            return jsonify({"detail": f"Falha de comunicação: {str(e)}"}), 503
    embrulhar.__name__ = funcao.__name__
    return embrulhar


def validar_admin():
    """Valida o token administrativo do cabeçalho X-Admin-Token."""
    if not ALUNOS_ADMIN_TOKEN:
        return jsonify({"detail": "Configure ALUNOS_ADMIN_TOKEN no arquivo .env"}), 503

    token_recebido = request.headers.get("X-Admin-Token", "").strip()
    if not token_recebido or token_recebido != ALUNOS_ADMIN_TOKEN:
        return jsonify({"detail": "Token administrativo inválido"}), 401


def validar_campos(dados, regras):
    erros = []
    for campo, cfg in regras.items():
        valor = str(dados.get(campo, "")).strip()
        if cfg.get("obrigatorio") and not valor:
            erros.append(f"Campo '{campo}' é obrigatório.")
        if "min" in cfg and len(valor) < cfg["min"]:
            erros.append(f"Campo '{campo}' precisa de no mínimo {cfg['min']} caracteres.")
        if "max" in cfg and len(valor) > cfg["max"]:
            erros.append(f"Campo '{campo}' ultrapassou o limite de {cfg['max']} caracteres.")
        if "padrao" in cfg and valor and not re.fullmatch(cfg["padrao"], valor):
            erros.append(cfg.get("mensagem", f"Formato inválido em '{campo}'."))
    return erros


# ---------------------- ROTAS PÚBLICAS ----------------------
@admin_bp.route("/")
def painel_admin():
    return render_template("admin.html")


@admin_bp.route("/api/app-version")
@tratar_erro_api
def obter_versao_aplicativo():
    dados = _api_get("/admin/api/app-version")
    return jsonify(dados)


# ---------------------- ROTAS PROTEGIDAS ----------------------
@admin_bp.route("/api/app-version", methods=["PUT"])
@tratar_erro_api
def atualizar_versao_aplicativo():
    auth = validar_admin()
    if auth: return auth

    dados = request.get_json() or {}
    erros = validar_campos(dados, {
        "version": {
            "obrigatorio": True,
            "padrao": r"^\d+\.\d+\.\d+$",
            "mensagem": "Versão deve seguir formato MAJOR.MINOR.PATCH (ex: 1.2.0)"
        }
    })
    if erros:
        return jsonify({"detail": erros[0]}), 422

    download_url = dados.get("download_url", "").strip()
    if download_url:
        parsed = urlparse(download_url)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            return jsonify({"detail": "URL deve começar com http:// ou https://"}), 422

    resposta = _api_put("/admin/api/app-version", {
        "version": dados["version"].strip(),
        "download_url": download_url,
        "release_notes": dados.get("release_notes", "").strip()
    })
    return jsonify(resposta)


@admin_bp.route("/api/alunos")
@tratar_erro_api
def listar_alunos():
    auth = validar_admin()
    if auth: return auth
    dados = _api_get("/admin/api/alunos")
    return jsonify(dados)


@admin_bp.route("/api/resumo")
@tratar_erro_api
def resumo():
    auth = validar_admin()
    if auth: return auth
    data_str = request.args.get("data")
    params = {"data": data_str} if data_str else {}
    dados = _api_get("/admin/api/resumo", params=params)
    return jsonify(dados)


@admin_bp.route("/api/faltas/enviar", methods=["POST"])
@tratar_erro_api
def enviar_faltas():
    auth = validar_admin()
    if auth: return auth

    dados = request.get_json() or {}
    erros = validar_campos(dados, {
        "data": {"obrigatorio": True},
        "titulo": {"min": 3, "max": 120},
        "mensagem": {"min": 5, "max": 1000}
    })
    if erros:
        return jsonify({"detail": erros[0]}), 422

    resposta = _api_post("/admin/api/faltas/enviar", {
        "data": dados["data"],
        "titulo": dados.get("titulo", "Falta registrada").strip(),
        "mensagem": dados.get(
            "mensagem",
            "Não identificamos a passagem do aluno pelo leitor facial nesta data. Em caso de divergência, entre em contato com a escola."
        ).strip()
    })
    return jsonify(resposta)


@admin_bp.route("/api/personalizada/enviar", methods=["POST"])
@tratar_erro_api
def enviar_personalizada():
    auth = validar_admin()
    if auth: return auth

    dados = request.get_json() or {}
    erros = validar_campos(dados, {
        "titulo": {"obrigatorio": True, "min": 3, "max": 120},
        "mensagem": {"obrigatorio": True, "min": 2, "max": 1000},
        "destino": {"obrigatorio": True, "padrao": r"^(todos|aluno)$", "mensagem": "Destino inválido."}
    })
    if erros:
        return jsonify({"detail": erros[0]}), 422

    corpo = {
        "titulo": dados["titulo"].strip(),
        "mensagem": dados["mensagem"].strip(),
        "destino": dados["destino"]
    }
    if dados["destino"] == "aluno":
        if not dados.get("matricula"):
            return jsonify({"detail": "Informe a matrícula do aluno."}), 422
        corpo["matricula"] = dados["matricula"].strip()

    resposta = _api_post("/admin/api/personalizada/enviar", corpo)
    return jsonify(resposta)


@admin_bp.route("/api/historico")
@tratar_erro_api
def historico_admin():
    auth = validar_admin()
    if auth: return auth
    limite = max(1, min(500, int(request.args.get("limite", 100))))
    dados = _api_get("/admin/api/historico", params={"limite": limite})
    return jsonify(dados)


@admin_bp.route("/api/alunos/cadastrar", methods=["POST"])
@tratar_erro_api
def cadastrar_aluno():
    auth = validar_admin()
    if auth: return auth

    dados = request.get_json() or {}
    erros = validar_campos(dados, {
        "matricula": {"obrigatorio": True, "min": 1, "max": 40},
        "nome_completo": {"obrigatorio": True, "min": 3, "max": 160},
    })
    if erros:
        return jsonify({"detail": erros[0]}), 422

    corpo = {
        "matricula": dados["matricula"].strip(),
        "nome_completo": dados["nome_completo"].strip(),
        "ativo": bool(dados.get("ativo", True)),
    }
    if dados.get("familia_id") not in (None, ""):
        try:
            corpo["familia_id"] = int(dados["familia_id"])
        except (ValueError, TypeError):
            return jsonify({"detail": "familia_id deve ser um numero inteiro."}), 422

    resposta = _api_post("/alunos/cadastrar", corpo)
    return jsonify(resposta)


@admin_bp.route("/api/alunos/importar", methods=["POST"])
@tratar_erro_api
def importar_alunos():
    auth = validar_admin()
    if auth: return auth

    dados = request.get_json() or {}
    alunos = dados.get("alunos")
    if not isinstance(alunos, list) or not alunos:
        return jsonify({"detail": "Informe uma lista nao vazia em 'alunos'."}), 422

    corpo = {"alunos": alunos}
    resposta = _api_post("/alunos/importar", corpo)
    return jsonify(resposta)


@admin_bp.route("/api/alunos/atualizar", methods=["POST"])
@tratar_erro_api
def atualizar_aluno():
    auth = validar_admin()
    if auth: return auth

    dados = request.get_json() or {}
    matricula = str(dados.get("matricula", "")).strip()
    nome_completo = str(dados.get("nome_completo", "")).strip()
    if not matricula or not nome_completo:
        return jsonify({"detail": "matricula e nome_completo sao obrigatorios."}), 422

    corpo_item = {
        "matricula": matricula,
        "nome_completo": nome_completo,
        "ativo": bool(dados.get("ativo", True)),
    }
    if dados.get("familia_id") not in (None, ""):
        try:
            corpo_item["familia_id"] = int(dados["familia_id"])
        except (ValueError, TypeError):
            return jsonify({"detail": "familia_id deve ser um numero inteiro."}), 422
    else:
        corpo_item["familia_id"] = None

    resposta = _api_post("/alunos/importar", {"alunos": [corpo_item]})
    return jsonify(resposta)


@admin_bp.route("/api/alunos/associar-irmaos", methods=["POST"])
@tratar_erro_api
def associar_irmaos():
    auth = validar_admin()
    if auth: return auth

    dados = request.get_json() or {}
    matriculas = dados.get("matriculas")
    if not isinstance(matriculas, list) or not matriculas:
        return jsonify({"detail": "Informe uma lista nao vazia de matriculas."}), 422
    matriculas = [str(m).strip() for m in matriculas if str(m).strip()]
    if not matriculas:
        return jsonify({"detail": "Informe uma lista nao vazia de matriculas."}), 422

    familia_id = dados.get("familia_id")
    if familia_id in (None, ""):
        try:
            existentes = _api_get("/admin/api/alunos")
            lista = existentes.get("alunos", []) if isinstance(existentes, dict) else existentes
            ids = [a.get("familia_id") for a in lista if isinstance(a, dict) and a.get("familia_id") is not None]
            familia_id = (max(ids) + 1) if ids else 1
        except Exception:
            familia_id = 1
    else:
        try:
            familia_id = int(familia_id)
        except (ValueError, TypeError):
            return jsonify({"detail": "familia_id deve ser um numero inteiro."}), 422

    try:
        existentes = _api_get("/admin/api/alunos")
        lista = existentes.get("alunos", []) if isinstance(existentes, dict) else existentes
    except Exception:
        lista = []
    mapa = {str(a.get("matricula")).strip(): a for a in lista if isinstance(a, dict)}

    alunos_payload = []
    for m in matriculas:
        a = mapa.get(m, {})
        alunos_payload.append({
            "matricula": m,
            "nome_completo": a.get("nome_completo") or m,
            "ativo": a.get("ativo", True) if a.get("ativo") is not None else True,
            "familia_id": familia_id,
        })

    resposta = _api_post("/alunos/importar", {"alunos": alunos_payload})
    return jsonify({"familia_id": familia_id, "matriculas": matriculas, "resultado": resposta})


app.register_blueprint(admin_bp)


if __name__ == "__main__":
    app.run(debug=True, port=5000)