import { colunaSensivel, decodificarNomeInterno } from '../../supabase/functions/sharepoint-sync-sgsi/sensivel';

// Filtro de credenciais do sync SGSI. O arquivo roda no Deno (edge function),
// mas não tem import por URL, então é testado aqui.

describe('colunaSensivel', () => {
  it('pega as colunas de senha da SG-LST-014 pelo displayName', () => {
    for (const nome of ['Senha AD', 'Senha Banco', 'Senha IBM', 'Senha Portal', 'Senha SMB', 'Senha TS']) {
      expect(colunaSensivel(nome, 'field_1')).toBe(true);
    }
  });

  it('pega pelo nome interno mesmo com o displayName renomeado', () => {
    expect(colunaSensivel('Credencial AD', 'Senha_x0020_AD')).toBe(true);
    expect(colunaSensivel(undefined, 'SenhaAD')).toBe(true);
    expect(colunaSensivel(undefined, 'Senha_AD')).toBe(true);
  });

  it('pega variações de nome', () => {
    for (const nome of ['Nova senha VPN', 'Senhas', 'SENHA BANCO', 'Password', 'UserPassword', 'PWD servidor', 'ÚltimaSenha']) {
      expect(colunaSensivel(nome, 'Title')).toBe(true);
    }
  });

  it('mantém as colunas que a tela usa e palavra que só contém "senha" no meio', () => {
    for (const nome of [
      'Resenha do incidente', 'Solicitante', 'Aprovador TI', 'Aprovador Gestor', 'Acesso ao TS',
      'Permissões administrativas', 'Comentário atualizações', 'Status solicitação', 'Criado por',
    ]) {
      expect(colunaSensivel(nome, 'Title')).toBe(false);
    }
  });

  it('decodifica o nome interno do SharePoint', () => {
    expect(decodificarNomeInterno('Senha_x0020_AD')).toBe('Senha AD');
    expect(decodificarNomeInterno('Coment_x00e1_rio')).toBe('Comentário');
    expect(decodificarNomeInterno('Title')).toBe('Title');
  });
});
