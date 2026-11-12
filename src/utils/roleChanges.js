// Shared by the services that hand out roles on their own (services/betaRole.js, services/groupRoles.js): a role change
// that may fail (a missing permission, the member left), and console warnings said once instead of every pass.

const warned = new Set();

export function warnOnce(key, message) {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(message);
}

// True when it went through. The caller tries again on its next pass; the failure is said once in the console.
export async function changeRole(member, change, tag) {
  try {
    await change();
    return true;
  } catch (err) {
    warnOnce(`${tag}:${member.guild.id}:${member.id}`, `[${tag}] Falhou ao mudar o cargo de ${member.user.tag} em ${member.guild.name}: ${err.message}`);
    return false;
  }
}
