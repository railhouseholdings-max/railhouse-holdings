"use client";
export default function WorkspaceError({reset}:{reset:()=>void}) {
  return <section className="panel"><h1>Workspace unavailable</h1><p className="note">Please retry. If private cloud mode was just enabled, check its environment variables, migrations, and owner setup. The app will not replace unavailable private data with demo records.</p><button className="button" type="button" onClick={reset}>Try again</button></section>;
}
