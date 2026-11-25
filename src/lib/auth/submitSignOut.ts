export function submitSignOut() {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = "/auth/signout";
  document.body.appendChild(form);
  form.submit();
}
