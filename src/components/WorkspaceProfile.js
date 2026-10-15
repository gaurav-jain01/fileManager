import SignOutButton from "./SignOutButton";

export default function WorkspaceProfile() {
  return <div className="workspace workspace-profile" aria-label="Workspace profile">
    <span className="workspace-avatar" aria-hidden="true">GJ</span>
    <div>
      <strong>Gaurav Jain</strong>
      <span>Assistant Professor</span>
      <span>Career Point University, Kota</span>
      <SignOutButton />
    </div>
  </div>;
}
