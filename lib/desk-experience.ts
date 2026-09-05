export type DeskExperience = "observatory" | "classic";

function isDeskExperience(value: string | null): value is DeskExperience {
  return value === "observatory" || value === "classic";
}

export function deskExperienceFromParams(input: URLSearchParams | string, saved: string | null): DeskExperience {
  const params = new URLSearchParams(input);
  const view = params.get("view");
  const desk = params.get("desk");
  if (isDeskExperience(view)) return view;
  if (isDeskExperience(desk)) return desk;
  return isDeskExperience(saved) ? saved : "observatory";
}

export function withDeskExperience(input: URLSearchParams | string, desk: DeskExperience) {
  const params = new URLSearchParams(input);
  params.set("desk", desk);
  params.set("view", desk);
  return params;
}
