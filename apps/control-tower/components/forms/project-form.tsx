import type { Project } from "@prisma/client";

import {
  deployTypeLabels,
  deployTypeOptions,
  environmentLabels,
  environmentOptions,
} from "@/lib/constants";
import { slugify } from "@/lib/utils";

import { Field, Input, Select, Textarea } from "@/components/ui/form-inputs";

type ProjectFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  project?: Project | null;
};

export function ProjectForm({ action, project }: ProjectFormProps) {
  return (
    <form action={action} className="grid gap-5 p-5">
      {project ? <input type="hidden" name="id" value={project.id} /> : null}
      {project ? <input type="hidden" name="previousSlug" value={project.slug} /> : null}
      <div className="grid gap-5 lg:grid-cols-2">
        <Field label="Project name" htmlFor="name">
          <Input id="name" name="name" defaultValue={project?.name ?? ""} required />
        </Field>
        <Field label="Slug" htmlFor="slug" description="Leave close to repo naming for cleaner URLs.">
          <Input
            id="slug"
            name="slug"
            defaultValue={project?.slug ?? slugify(project?.name ?? "")}
            required
          />
        </Field>
      </div>

      <Field label="Description" htmlFor="description">
        <Textarea id="description" name="description" defaultValue={project?.description ?? ""} />
      </Field>

      <div className="grid gap-5 lg:grid-cols-2">
        <Field label="Repository URL" htmlFor="repoUrl">
          <Input id="repoUrl" name="repoUrl" type="url" defaultValue={project?.repoUrl ?? ""} required />
        </Field>
        <Field label="Repo name" htmlFor="repoName">
          <Input id="repoName" name="repoName" defaultValue={project?.repoName ?? ""} required />
        </Field>
      </div>

      <div className="grid gap-5 lg:grid-cols-4">
        <Field label="Default branch" htmlFor="defaultBranch">
          <Input
            id="defaultBranch"
            name="defaultBranch"
            defaultValue={project?.defaultBranch ?? "main"}
            required
          />
        </Field>
        <Field label="Deploy type" htmlFor="deployType">
          <Select id="deployType" name="deployType" defaultValue={project?.deployType ?? "droplet"}>
            {deployTypeOptions.map((option) => (
              <option key={option} value={option}>
                {deployTypeLabels[option]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Environment" htmlFor="environment">
          <Select id="environment" name="environment" defaultValue={project?.environment ?? "dev"}>
            {environmentOptions.map((option) => (
              <option key={option} value={option}>
                {environmentLabels[option]}
              </option>
            ))}
          </Select>
        </Field>
        <label className="mt-8 flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-ink">
          <input
            type="checkbox"
            name="isActive"
            defaultChecked={project?.isActive ?? true}
            className="h-4 w-4 rounded border-slate-300"
          />
          Active project
        </label>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Field label="Deploy target name" htmlFor="deployTargetName">
          <Input
            id="deployTargetName"
            name="deployTargetName"
            defaultValue={project?.deployTargetName ?? ""}
            required
          />
        </Field>
        <Field label="Deploy target host / app id" htmlFor="deployTargetIdOrHost">
          <Input
            id="deployTargetIdOrHost"
            name="deployTargetIdOrHost"
            defaultValue={project?.deployTargetIdOrHost ?? ""}
            required
          />
        </Field>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Field label="Container image" htmlFor="containerImage">
          <Input id="containerImage" name="containerImage" defaultValue={project?.containerImage ?? ""} />
        </Field>
        <Field label="Registry URL" htmlFor="containerRegistryUrl">
          <Input
            id="containerRegistryUrl"
            name="containerRegistryUrl"
            defaultValue={project?.containerRegistryUrl ?? ""}
          />
        </Field>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Field label="Public URL" htmlFor="publicUrl">
          <Input id="publicUrl" name="publicUrl" type="url" defaultValue={project?.publicUrl ?? ""} />
        </Field>
        <Field label="Deploy command" htmlFor="deployCommand">
          <Textarea id="deployCommand" name="deployCommand" defaultValue={project?.deployCommand ?? ""} />
        </Field>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Field label="Health check URL" htmlFor="healthCheckUrl">
          <Input
            id="healthCheckUrl"
            name="healthCheckUrl"
            type="url"
            defaultValue={project?.healthCheckUrl ?? ""}
          />
        </Field>
        <Field label="Deploy mode" htmlFor="deployMode">
          <Input id="deployMode" name="deployMode" defaultValue={project?.deployMode ?? ""} />
        </Field>
      </div>

      <div className="grid gap-5 lg:grid-cols-4">
        <Field label="SSH host" htmlFor="sshHost">
          <Input id="sshHost" name="sshHost" defaultValue={project?.sshHost ?? ""} />
        </Field>
        <Field label="SSH port" htmlFor="sshPort">
          <Input id="sshPort" name="sshPort" type="number" defaultValue={project?.sshPort ?? ""} />
        </Field>
        <Field label="SSH user" htmlFor="sshUser">
          <Input id="sshUser" name="sshUser" defaultValue={project?.sshUser ?? ""} />
        </Field>
        <Field label="App path" htmlFor="appPath">
          <Input id="appPath" name="appPath" defaultValue={project?.appPath ?? ""} />
        </Field>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Field label="Process manager" htmlFor="processManager">
          <Input id="processManager" name="processManager" defaultValue={project?.processManager ?? ""} />
        </Field>
        <Field label="Runtime services" htmlFor="runtimeServices" description="Useful shorthand like api/web PM2 process names or ids.">
          <Input id="runtimeServices" name="runtimeServices" defaultValue={project?.runtimeServices ?? ""} />
        </Field>
        <Field label="Dockerfile status" htmlFor="dockerfileStatus">
          <Input id="dockerfileStatus" name="dockerfileStatus" defaultValue={project?.dockerfileStatus ?? ""} />
        </Field>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Field label="Restart command" htmlFor="restartCommand">
          <Textarea id="restartCommand" name="restartCommand" defaultValue={project?.restartCommand ?? ""} />
        </Field>
        <Field label="Log command" htmlFor="logCommand">
          <Textarea id="logCommand" name="logCommand" defaultValue={project?.logCommand ?? ""} />
        </Field>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Field label="Internal API URL" htmlFor="internalApiUrl">
          <Input id="internalApiUrl" name="internalApiUrl" type="url" defaultValue={project?.internalApiUrl ?? ""} />
        </Field>
        <Field label="Internal health URL" htmlFor="internalApiHealthUrl">
          <Input
            id="internalApiHealthUrl"
            name="internalApiHealthUrl"
            type="url"
            defaultValue={project?.internalApiHealthUrl ?? ""}
          />
        </Field>
        <Field label="Internal healthz URL" htmlFor="internalApiHealthzUrl">
          <Input
            id="internalApiHealthzUrl"
            name="internalApiHealthzUrl"
            type="url"
            defaultValue={project?.internalApiHealthzUrl ?? ""}
          />
        </Field>
      </div>

      <Field
        label="Compose usage"
        htmlFor="composeUsage"
        description="Capture whether Compose exists, is used live, or is just a local/dev artifact."
      >
        <Textarea id="composeUsage" name="composeUsage" defaultValue={project?.composeUsage ?? ""} />
      </Field>

      <div className="flex justify-end">
        <button className="rounded-xl bg-ink px-4 py-2.5 text-sm font-medium text-white" type="submit">
          {project ? "Save project" : "Create project"}
        </button>
      </div>
    </form>
  );
}
