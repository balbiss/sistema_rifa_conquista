import { get, run, tx } from './db'
import { hashPassword } from './auth'
import { audit, confirmParticipation, createParticipation, generateNumbers } from './services'

export const DEMO_REGULATION = `REGULAMENTO — MINUTA PARA ANÁLISE JURÍDICA
Campanha: CONQUISTE SUA HABILITAÇÃO A/B
Situação: RASCUNHO — AGUARDANDO REGULARIZAÇÃO

ATENÇÃO: este texto é uma minuta de trabalho. A campanha NÃO está aberta a participações. A modalidade legal (ex.: promoção comercial autorizada, assistência/filantropia ou outra prevista em lei) ainda será definida e, quando exigido, autorizada pelo órgão competente. Até lá não há venda de números, pagamento, sorteio real nem oferta de prêmio em dinheiro.

1. ORGANIZADOR
Dados completos do organizador (razão social, CNPJ, endereço) conforme Configurações › Dados do organizador.

2. OBJETO
Campanha promocional cujo prêmio principal é um pacote de formação para habilitação nas categorias A e B (carro e moto).

3. ELEMENTOS SORTEÁVEIS
3.1. A campanha possui 1.000 (mil) identificadores, numerados de 000 a 999.
3.2. Cada identificador é único e só pode ser atribuído a uma participação válida.
3.3. A chance de cada identificador é de 1 em 1.000 (0,1%). A chance de um participante é proporcional à quantidade de identificadores válidos atribuídos a ele.

4. PRÊMIO
4.1. Pacote de habilitação A/B cobrindo as taxas e aulas práticas previstas neste regulamento, em autoescola credenciada indicada pelo organizador.
4.2. Valor estimado do prêmio: R$ 1.450,00.
4.3. A obtenção da CNH depende do cumprimento dos requisitos legais (idade mínima, alfabetização, aptidão física e mental, exames e provas do DETRAN) e da aprovação do candidato. O organizador não garante a aprovação.
4.4. O prêmio é pessoal e intransferível, salvo o que a legislação aplicável e a autorização permitirem.
4.5. Não há conversão do prêmio em dinheiro, salvo se a modalidade autorizada permitir e isso constar da versão aprovada deste regulamento.

5. APURAÇÃO (REGRA PROPOSTA)
5.1. Resultado da Loteria Federal da extração a ser definida na versão aprovada deste regulamento.
5.2. O identificador contemplado é formado pelos três últimos dígitos do 1º prêmio. Exemplo hipotético: 1º prêmio 48273 → identificador 273.
5.3. Se o identificador apurado não estiver atribuído a participação válida, aplica-se a regra de aproximação definida na versão aprovada.
5.4. A apuração é registrada com data, hora, fonte e relatório, e não pode ser alterada depois de gravada.

6. ENCERRAMENTO
Após a conclusão das participações, respeitando o prazo e o regulamento previamente definidos.

7. DADOS PESSOAIS
Tratados conforme a LGPD e a Política de Privacidade da plataforma.`

export const REGULATION_TEMPLATE = `REGULAMENTO
Campanha: CONQUISTE SUA HABILITAÇÃO A/B

1. ORGANIZADOR
Dados completos do organizador (razão social, CNPJ, endereço) conforme Configurações › Organizador.

2. OBJETO
Campanha promocional cujo prêmio principal é um pacote de formação para habilitação nas categorias A e B (carro e moto).

3. PARTICIPAÇÃO
3.1. A participação é feita pelo site, com pagamento via PIX, informando nome, CPF e WhatsApp.
3.2. Cada participação confirmada recebe identificadores únicos, mostrados na tela após o pagamento e disponíveis em "Meus números".

4. ELEMENTOS SORTEÁVEIS
4.1. A campanha possui 1.000 (mil) identificadores, numerados de 000 a 999.
4.2. Cada identificador é único e só pode ser atribuído a uma participação confirmada.
4.3. A chance de cada identificador é de 1 em 1.000 (0,1%).

5. PRÊMIO
5.1. Pacote de habilitação A/B cobrindo as taxas e aulas práticas previstas, em autoescola credenciada indicada pelo organizador.
5.2. A obtenção da CNH depende do cumprimento dos requisitos legais e da aprovação do candidato nos exames do DETRAN.
5.3. O prêmio é pessoal e intransferível e não pode ser convertido em dinheiro.

6. APURAÇÃO
6.1. Resultado da Loteria Federal da extração informada na área de Transparência.
6.2. O identificador contemplado é formado pelos três últimos dígitos do 1º prêmio. Exemplo: 1º prêmio 48273 → identificador 273.
6.3. A apuração é registrada com data, hora e fonte, e não pode ser alterada depois de gravada.

7. DADOS PESSOAIS
Tratados conforme a LGPD e a Política de Privacidade da plataforma.`

export async function seed({ withDemoData = true } = {}) {
  if (get('SELECT id FROM users LIMIT 1')) return false
  // produção: BOOTSTRAP_ADMIN_EMAIL/PASSWORD criam SÓ o administrador real (nenhum usuário de teste)
  const boot = process.env.BOOTSTRAP_ADMIN_EMAIL ? { email: process.env.BOOTSTRAP_ADMIN_EMAIL.trim().toLowerCase(), password: process.env.BOOTSTRAP_ADMIN_PASSWORD || '', name: process.env.BOOTSTRAP_ADMIN_NAME || 'Administrador' } : null
  if (boot && boot.password.length < 10) throw new Error('BOOTSTRAP_ADMIN_PASSWORD precisa ter 10+ caracteres')
  if (boot) withDemoData = false
  const adminHash = await hashPassword(boot ? boot.password : 'Admin123')
  const affHash = await hashPassword('Afiliado123')
  const partHash = await hashPassword('Participante123')

  const ids = tx(() => {
    const admin = Number(run("INSERT INTO users (name, email, password_hash, role, permissions) VALUES (?, ?, ?, 'admin', '[\"*\"]')", boot ? boot.name : 'Administrador', boot ? boot.email : 'admin@teste.local', adminHash).lastInsertRowid)
    const aff = (boot ? [] : [
      ['Ana Souza', 'ana@teste.local', 'ANA10', '91988887777'],
      ['Bruno Lima', 'bruno@teste.local', 'BRUNO', '91977776666'],
      ['Carla Dias', 'carla@teste.local', 'CARLA', '91966665555'],
    ]).map(([name, email, code, phone]) => {
      const uid = Number(run("INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, 'afiliado')", name, email, affHash).lastInsertRowid)
      return Number(run('INSERT INTO affiliates (user_id, name, code, phone, email) VALUES (?, ?, ?, ?, ?)', uid, name, code, phone, email).lastInsertRowid)
    })

    const camp = Number(run(`INSERT INTO campaigns (slug, name, subtitle, description, prize_summary, prize_conditions, total_numbers, number_start, number_digits, ref_price, commission_value, regulation, status, legal_status, draw_method, draw_rule, featured, created_by)
      VALUES ('conquiste-sua-habilitacao-ab', 'Conquiste sua Habilitação A/B', 'Categorias A e B — Carro e Moto.', ?, ?, ?, 1000, 0, 3, 10, 2.5, ?, 'rascunho', 'pendente', 'loteria_federal', 'ultimos_3_primeiro_premio', 1, ?)`,
      'Uma campanha para quem quer tirar a habilitação de carro e moto. O prêmio principal é um pacote completo de formação para as categorias A e B, com as taxas e aulas práticas previstas no regulamento.',
      'Pacote de formação para habilitação nas categorias A e B (carro e moto).',
      'Cobre as taxas e aulas práticas previstas no regulamento. A obtenção da CNH depende do cumprimento dos requisitos legais e da aprovação do candidato nos exames do DETRAN.',
      boot ? REGULATION_TEMPLATE : DEMO_REGULATION, admin).lastInsertRowid)
    generateNumbers(camp, 1000, 0)
    run(`INSERT INTO prizes (campaign_id, kind, title, description, estimated_value, delivery_conditions, is_cash, legal_approved, public) VALUES
      (?, 'principal', 'Pacote de Habilitação A/B', 'Formação para habilitação nas categorias A (moto) e B (carro): taxas e aulas práticas previstas no regulamento.', 1450, 'Entrega em autoescola credenciada indicada pelo organizador. A CNH depende dos requisitos legais e da aprovação do candidato.', 0, 0, 1),
      (?, 'alternativo', 'Proposta: R$ 1.100 em dinheiro', 'Alternativa proposta ao prêmio principal. SÓ PODE SER OFERECIDA após validação jurídica e inclusão no regulamento aprovado.', 1100, 'Dependente de análise jurídica específica.', 1, 0, 0)`, camp, camp)
    run("INSERT INTO campaign_history (campaign_id, user_id, action, changes) VALUES (?, ?, 'criada', '{\"origem\":\"campanha de demonstração\"}')", camp, admin)
    run("INSERT INTO expenses (campaign_id, description, category, amount, date, created_by) VALUES (?, 'Estimativa: pacote de habilitação A/B (prêmio)', 'premio', 1450, date('now'), ?)", camp, admin)
    if (boot) return { admin, aff, camp, partUser: 0 }
    const partUser = Number(run("INSERT INTO users (name, email, password_hash, role) VALUES ('Paula Participante', 'participante@teste.local', ?, 'participante')", partHash).lastInsertRowid)
    return { admin, aff, camp, partUser }
  })

  audit({ id: ids.admin, name: 'Administrador' }, 'sistema.seed', 'system', null, { demo: withDemoData })
  if (!withDemoData) return true

  // dados de SIMULAÇÃO (marcados simulated=1): não contam no progresso público nem em valores reais
  const nomes = ['Lucas Pereira', 'Mariana Alves', 'João Santos', 'Fernanda Costa', 'Rafael Oliveira', 'Juliana Rocha', 'Pedro Martins', 'Camila Ribeiro', 'Thiago Gomes', 'Beatriz Carvalho', 'Gabriel Freitas', 'Larissa Mendes', 'Diego Barbosa', 'Aline Teixeira', 'Felipe Moura', 'Patrícia Lopes', 'Rodrigo Nunes', 'Vanessa Cardoso']
  const admin = { id: ids.admin, name: 'Administrador' }
  nomes.forEach((name, i) => {
    const affiliate = i % 4 === 3 ? null : ids.aff[i % 3]
    const days = 20 - i
    const pid = Number(run(`INSERT INTO participants (campaign_id, user_id, affiliate_id, name, phone, email, origin, simulated, consent_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now', ?))`,
      ids.camp, i === 0 ? ids.partUser : null, affiliate, name, `9198${String(1000000 + i * 7919).slice(-7)}`, i === 0 ? 'participante@teste.local' : `${name.split(' ')[0].toLowerCase()}@exemplo.com`,
      affiliate ? 'indicacao' : 'site', `-${days} days`).lastInsertRowid)
    if (i < 14) {
      const p = createParticipation({ campaignId: ids.camp, participantId: pid, quantity: 3 + (i % 5) * 4, simulated: true, user: admin }) as any
      if (i < 12) confirmParticipation(p.id, admin)
      run("UPDATE participations SET created_at = datetime('now', ?), confirmed_at = CASE WHEN confirmed_at IS NOT NULL THEN datetime('now', ?) END WHERE id = ?", `-${days} days`, `-${days} days`, p.id)
      run("UPDATE commissions SET created_at = datetime('now', ?) WHERE participation_id = ?", `-${days} days`, p.id)
    }
  })
  // alguns status de comissão diferentes pra demonstração
  const coms = (await import('./db')).all<any>('SELECT id FROM commissions ORDER BY id')
  const { changeCommission } = await import('./services')
  if (coms[0]) { changeCommission(coms[0].id, 'aprovada', admin); changeCommission(coms[0].id, 'paga', admin, 'simulação', 'SIM-0001') }
  if (coms[1]) changeCommission(coms[1].id, 'aprovada', admin)
  if (coms[2]) changeCommission(coms[2].id, 'aprovada', admin)
  for (let i = 0; i < 37; i++) run("INSERT INTO referral_visits (affiliate_id, campaign_id, visitor, at) VALUES (?, ?, ?, datetime('now', ?))", ids.aff[i % 3], ids.camp, 'seed' + i, `-${i % 20} days`)
  return true
}
