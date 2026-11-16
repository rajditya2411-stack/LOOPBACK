"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

type ViewMode = "kanban" | "list";

interface CourseItem {
  id: string;
  code: string;
  name: string;
  color: string;
}

interface AcademicProject {
  id: string;
  name: string;
  courseCode: string;
  description?: string;
}

interface MilestoneItem {
  id: string;
  title: string;
  description?: string | null;
  category?: string;
  status: string;
  progress: number; // 0.0 to 1.0
  target_date?: string | null;
  course: string;
  project: string;
  rawDescription: string;
}

interface KanbanTaskItem {
  id: string;
  title: string;
  description?: string | null;
  status: "todo" | "in_progress" | "review" | "done";
  priority: "low" | "medium" | "high" | "urgent";
  due_date?: string | null;
  course: string;
  project: string;
  rawDescription: string;
}

const DEFAULT_COURSES: CourseItem[] = [
  { id: "c-math", code: "MATH201", name: "Calculus II", color: "bg-primary" },
  { id: "c-chem", code: "CHEM301", name: "Organic Chem", color: "bg-tertiary" },
  { id: "c-cs", code: "CS101", name: "Algorithms", color: "bg-primary-container" },
  { id: "c-phys", code: "PHYS220", name: "Physics", color: "bg-secondary" },
];

const DEFAULT_PROJECTS: AcademicProject[] = [
  {
    id: "p-chem",
    name: "CHEM CH1: Organic Mechanisms",
    courseCode: "CHEM301",
    description: "SN1, SN2 pathways and stereochemistry derivations",
  },
  {
    id: "p-math",
    name: "MATH201: Multivariable Vector Fields",
    courseCode: "MATH201",
    description: "Green's, Stokes, and divergence theorems",
  },
  {
    id: "p-cs",
    name: "CS101: Balanced Binary Search Trees",
    courseCode: "CS101",
    description: "Red-Black tree rotations and asymptotic benchmarks",
  },
];

const COLOR_OPTIONS = [
  { label: "Primary Blue", value: "bg-primary" },
  { label: "Tertiary Ochre", value: "bg-tertiary" },
  { label: "Indigo", value: "bg-primary-container" },
  { label: "Slate Secondary", value: "bg-secondary" },
  { label: "Emerald Green", value: "bg-emerald-600" },
  { label: "Amber Orange", value: "bg-amber-600" },
  { label: "Rose Crimson", value: "bg-rose-500" },
  { label: "Cyan Sky", value: "bg-sky-500" },
];

function parseCourseAndProject(raw?: string | null, fallbackCourse = "CS101"): {
  course: string;
  project: string;
  text: string;
} {
  if (!raw) return { course: fallbackCourse, project: "General Project", text: "" };
  const match = raw.match(/^\[(.*?) \| (.*?)\] ([\s\S]*)$/);
  if (match) {
    return {
      course: match[1].trim() || fallbackCourse,
      project: match[2].trim() || "General Project",
      text: match[3].trim(),
    };
  }
  return { course: fallbackCourse, project: "General Project", text: raw };
}

function formatCourseAndProject(course: string, project: string, text: string): string {
  return `[${course} | ${project}] ${text}`;
}

export default function MilestonesPage() {
  const router = useRouter();

  // Layout View Mode
  const [viewMode, setViewMode] = useState<ViewMode>("kanban");

  // Courses & Projects Taxonomy
  const [courses, setCourses] = useState<CourseItem[]>(DEFAULT_COURSES);
  const [projects, setProjects] = useState<AcademicProject[]>(DEFAULT_PROJECTS);
  const [selectedCourse, setSelectedCourse] = useState<string>("all");
  const [selectedProject, setSelectedProject] = useState<string>("all");

  // Real Data State from Backend
  const [milestones, setMilestones] = useState<MilestoneItem[]>([]);
  const [tasks, setTasks] = useState<KanbanTaskItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Concept Banner Visibility (Difference between Milestones & Tasks)
  const [showConceptExplainer, setShowConceptExplainer] = useState(true);

  // Modals
  const [showAddCourseModal, setShowAddCourseModal] = useState(false);
  const [newCourseCode, setNewCourseCode] = useState("");
  const [newCourseName, setNewCourseName] = useState("");
  const [newCourseColor, setNewCourseColor] = useState("bg-primary");

  const [showAddProjectModal, setShowAddProjectModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectCourse, setNewProjectCourse] = useState("CHEM301");
  const [newProjectDesc, setNewProjectDesc] = useState("");

  const [showNewTaskModal, setShowNewTaskModal] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskCourse, setNewTaskCourse] = useState("CS101");
  const [newTaskProject, setNewTaskProject] = useState("CS101: Balanced Binary Search Trees");
  const [newTaskPriority, setNewTaskPriority] = useState<"low" | "medium" | "high" | "urgent">("medium");
  const [newTaskStatus, setNewTaskStatus] = useState<"todo" | "in_progress" | "review" | "done">("todo");
  const [newTaskDue, setNewTaskDue] = useState("");

  const [showNewMilestoneModal, setShowNewMilestoneModal] = useState(false);
  const [newMileTitle, setNewMileTitle] = useState("");
  const [newMileCourse, setNewMileCourse] = useState("MATH201");
  const [newMileProject, setNewMileProject] = useState("MATH201: Multivariable Vector Fields");
  const [newMileDesc, setNewMileDesc] = useState("");
  const [newMileProgress, setNewMileProgress] = useState(0);
  const [newMileDate, setNewMileDate] = useState("");

  // Inspect Milestone Drawer / Modal
  const [inspectMilestone, setInspectMilestone] = useState<MilestoneItem | null>(null);

  // Load Courses & Projects from LocalStorage on client mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const savedCourses = localStorage.getItem("loopback_student_courses");
        if (savedCourses) {
          const parsed = JSON.parse(savedCourses);
          if (Array.isArray(parsed) && parsed.length > 0) setCourses(parsed);
        }
        const savedProjects = localStorage.getItem("loopback_student_projects");
        if (savedProjects) {
          const parsed = JSON.parse(savedProjects);
          if (Array.isArray(parsed) && parsed.length > 0) setProjects(parsed);
        }
      } catch (e) {
        console.error("Failed to load saved taxonomy:", e);
      }
    }
  }, []);

  // Save courses when updated
  const updateCourses = (updated: CourseItem[]) => {
    setCourses(updated);
    if (typeof window !== "undefined") {
      localStorage.setItem("loopback_student_courses", JSON.stringify(updated));
    }
  };

  // Save projects when updated
  const updateProjects = (updated: AcademicProject[]) => {
    setProjects(updated);
    if (typeof window !== "undefined") {
      localStorage.setItem("loopback_student_projects", JSON.stringify(updated));
    }
  };

  // Fetch real data from Backend (/api/goals and /api/tasks)
  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [goalsRes, tasksRes] = await Promise.allSettled([
        api.get<Array<{
          id: string;
          title: string;
          description?: string | null;
          category?: string;
          status: string;
          progress: number;
          target_date?: string | null;
        }>>("/goals"),
        api.get<Array<{
          id: string;
          title: string;
          description?: string | null;
          status: string;
          priority: string;
          due_date?: string | null;
        }>>("/tasks"),
      ]);

      if (goalsRes.status === "fulfilled" && Array.isArray(goalsRes.value)) {
        const parsedMilestones: MilestoneItem[] = goalsRes.value.map((g) => {
          const { course, project, text } = parseCourseAndProject(g.description, "MATH201");
          return {
            id: g.id,
            title: g.title,
            description: text,
            category: g.category,
            status: g.status,
            progress: typeof g.progress === "number" ? g.progress : 0,
            target_date: g.target_date,
            course,
            project,
            rawDescription: g.description || "",
          };
        });
        setMilestones(parsedMilestones);
      }

      if (tasksRes.status === "fulfilled" && Array.isArray(tasksRes.value)) {
        const parsedTasks: KanbanTaskItem[] = tasksRes.value.map((t) => {
          const { course, project, text } = parseCourseAndProject(t.description, "CS101");
          return {
            id: t.id,
            title: t.title,
            description: text,
            status: (["todo", "in_progress", "review", "done"].includes(t.status)
              ? t.status
              : "todo") as any,
            priority: (["low", "medium", "high", "urgent"].includes(t.priority)
              ? t.priority
              : "medium") as any,
            due_date: t.due_date,
            course,
            project,
            rawDescription: t.description || "",
          };
        });
        setTasks(parsedTasks);
      }
    } catch (err) {
      console.error("Failed to load milestones and tasks:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Quick Starter Seed Function (Creates real items in backend if workspace is empty)
  const handleSeedStarterData = async () => {
    setIsSubmitting(true);
    try {
      // Create Starter Goals
      await api.post("/goals", {
        title: "Calculus II Midterm Exam",
        description: formatCourseAndProject(
          "MATH201",
          "MATH201: Multivariable Vector Fields",
          "Multivariable integration, Green's & Stokes theorem."
        ),
        category: "monthly",
        status: "active",
        progress: 0.75,
      });

      await api.post("/goals", {
        title: "Organic Synthesis Lab Report",
        description: formatCourseAndProject(
          "CHEM301",
          "CHEM301: Organic Mechanisms",
          "Nucleophilic substitution & distillation yield analysis."
        ),
        category: "monthly",
        status: "active",
        progress: 0.6,
      });

      await api.post("/goals", {
        title: "P-Set 3: Red-Black Trees",
        description: formatCourseAndProject(
          "CS101",
          "CS101: Balanced Binary Search Trees",
          "Self-balancing invariants, left-rotations, and amortized bounds."
        ),
        category: "monthly",
        status: "active",
        progress: 0.4,
      });

      // Create Starter Tasks
      await api.post("/tasks", {
        title: "Implement Red-Black tree deletion fixup",
        description: formatCourseAndProject(
          "CS101",
          "CS101: Balanced Binary Search Trees",
          "Verify invariant 4 after double-black rotation"
        ),
        priority: "urgent",
        status: "todo",
      });

      await api.post("/tasks", {
        title: "Stokes Theorem practice exercises 1-15",
        description: formatCourseAndProject(
          "MATH201",
          "MATH201: Multivariable Vector Fields",
          "Vector calculus line vs surface integrals"
        ),
        priority: "high",
        status: "todo",
      });

      await api.post("/tasks", {
        title: "Draft reaction mechanisms for SN1 vs SN2",
        description: formatCourseAndProject(
          "CHEM301",
          "CHEM301: Organic Mechanisms",
          "Carbocation stability, protic solvents effect"
        ),
        priority: "medium",
        status: "in_progress",
      });

      await api.post("/tasks", {
        title: "Benchmarking balanced binary search tree queries",
        description: formatCourseAndProject(
          "CS101",
          "CS101: Balanced Binary Search Trees",
          "Run time analysis against random inserts"
        ),
        priority: "low",
        status: "in_progress",
      });

      await api.post("/tasks", {
        title: "Harmonic oscillator damping formulas review",
        description: formatCourseAndProject(
          "PHYS220",
          "General Physics",
          "Underdamped, overdamped, and critical damping Q-factors"
        ),
        priority: "medium",
        status: "review",
      });

      await api.post("/tasks", {
        title: "Review Kinetics Chapter 4 lecture notes & practice problems",
        description: formatCourseAndProject(
          "CHEM301",
          "CHEM301: Organic Mechanisms",
          "All rate equation formulas reviewed and practice problems solved"
        ),
        priority: "low",
        status: "done",
      });

      await fetchData();
    } catch (err) {
      console.error("Failed to seed sample syllabus data:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Add Course Handler
  const handleAddCourse = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCourseCode.trim()) return;
    const code = newCourseCode.trim().toUpperCase();
    const name = newCourseName.trim() || code;
    if (courses.some((c) => c.code === code)) {
      alert("A course with this code already exists.");
      return;
    }
    const newCourse: CourseItem = {
      id: `c-${Date.now()}`,
      code,
      name,
      color: newCourseColor,
    };
    const updated = [...courses, newCourse];
    updateCourses(updated);
    setNewCourseCode("");
    setNewCourseName("");
    setShowAddCourseModal(false);
  };

  // Delete Course Handler
  const handleDeleteCourse = (code: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm(`Delete course ${code}? Tasks and milestones associated with it will remain.`)) {
      const updated = courses.filter((c) => c.code !== code);
      updateCourses(updated);
      if (selectedCourse === code) setSelectedCourse("all");
    }
  };

  // Add Project Handler
  const handleAddProject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;
    const proj: AcademicProject = {
      id: `p-${Date.now()}`,
      name: newProjectName.trim(),
      courseCode: newProjectCourse,
      description: newProjectDesc.trim(),
    };
    const updated = [...projects, proj];
    updateProjects(updated);
    setNewProjectName("");
    setNewProjectDesc("");
    setShowAddProjectModal(false);
  };

  // Delete Project Handler
  const handleDeleteProject = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("Delete this academic project?")) {
      const updated = projects.filter((p) => p.id !== id);
      updateProjects(updated);
      setSelectedProject("all");
    }
  };

  // Move Task Across Kanban Columns
  const handleMoveTask = async (
    id: string,
    newStatus: "todo" | "in_progress" | "review" | "done"
  ) => {
    // Optimistic UI update
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, status: newStatus } : t))
    );
    try {
      await api.put(`/tasks/${id}`, { status: newStatus });
    } catch (err) {
      console.error("Failed to update task status:", err);
      fetchData(); // Rollback on error
    }
  };

  // Delete Task
  const handleDeleteTask = async (id: string) => {
    if (!confirm("Are you sure you want to delete this study task?")) return;
    setTasks((prev) => prev.filter((t) => t.id !== id));
    try {
      await api.delete(`/tasks/${id}`);
    } catch (err) {
      console.error("Failed to delete task:", err);
      fetchData();
    }
  };

  // Create Task
  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;
    setIsSubmitting(true);
    try {
      const fullDesc = formatCourseAndProject(
        newTaskCourse,
        newTaskProject,
        ""
      );
      const created = await api.post<{
        id: string;
        title: string;
        description?: string | null;
        status: string;
        priority: string;
        due_date?: string | null;
      }>("/tasks", {
        title: newTaskTitle.trim(),
        description: fullDesc,
        status: newTaskStatus,
        priority: newTaskPriority,
        due_date: newTaskDue ? new Date(newTaskDue).toISOString() : undefined,
      });

      const parsed: KanbanTaskItem = {
        id: created.id,
        title: created.title,
        description: "",
        status: newTaskStatus,
        priority: newTaskPriority,
        due_date: created.due_date,
        course: newTaskCourse,
        project: newTaskProject,
        rawDescription: fullDesc,
      };

      setTasks([parsed, ...tasks]);
      setNewTaskTitle("");
      setShowNewTaskModal(false);
    } catch (err) {
      console.error("Failed to create task:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Create Milestone
  const handleCreateMilestone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMileTitle.trim()) return;
    setIsSubmitting(true);
    try {
      const fullDesc = formatCourseAndProject(
        newMileCourse,
        newMileProject,
        newMileDesc.trim() || "Active sprint target for semester assessment."
      );

      const created = await api.post<{
        id: string;
        title: string;
        description?: string | null;
        category?: string;
        status: string;
        progress: number;
        target_date?: string | null;
      }>("/goals", {
        title: newMileTitle.trim(),
        description: fullDesc,
        category: "monthly",
        status: "active",
        progress: Number((newMileProgress / 100).toFixed(2)),
        target_date: newMileDate ? new Date(newMileDate).toISOString() : undefined,
      });

      const parsed: MilestoneItem = {
        id: created.id,
        title: created.title,
        description: newMileDesc.trim() || "Active sprint target for semester assessment.",
        category: "monthly",
        status: "active",
        progress: Number((newMileProgress / 100).toFixed(2)),
        target_date: created.target_date,
        course: newMileCourse,
        project: newMileProject,
        rawDescription: fullDesc,
      };

      setMilestones([parsed, ...milestones]);
      setNewMileTitle("");
      setNewMileDesc("");
      setShowNewMilestoneModal(false);
    } catch (err) {
      console.error("Failed to create milestone:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Update Milestone Progress
  const handleUpdateMilestoneProgress = async (id: string, newProgress: number) => {
    const floatVal = Number((newProgress / 100).toFixed(2));
    const newStatus = floatVal >= 1.0 ? "completed" : "active";
    setMilestones((prev) =>
      prev.map((m) => (m.id === id ? { ...m, progress: floatVal, status: newStatus } : m))
    );
    if (inspectMilestone && inspectMilestone.id === id) {
      setInspectMilestone({ ...inspectMilestone, progress: floatVal, status: newStatus });
    }
    try {
      await api.put(`/goals/${id}`, {
        progress: floatVal,
        status: newStatus,
      });
    } catch (err) {
      console.error("Failed to update milestone progress:", err);
      fetchData();
    }
  };

  // Delete Milestone
  const handleDeleteMilestone = async (id: string) => {
    if (!confirm("Delete this academic milestone?")) return;
    setMilestones((prev) => prev.filter((m) => m.id !== id));
    if (inspectMilestone && inspectMilestone.id === id) {
      setInspectMilestone(null);
    }
    try {
      await api.delete(`/goals/${id}`);
    } catch (err) {
      console.error("Failed to delete milestone:", err);
      fetchData();
    }
  };

  // Launch AI Study Session in Chat
  const handleLaunchStudySession = (title: string, course: string, project?: string) => {
    const query = new URLSearchParams({
      milestone: title,
      title: `Study Session: ${title}`,
      course: course,
      project: project || "",
    }).toString();
    router.push(`/chat?${query}`);
  };

  // Helper: Find Course Color
  const getCourseColor = (code: string) => {
    const c = courses.find((item) => item.code.toUpperCase() === code.toUpperCase());
    return c ? c.color : "bg-primary-container";
  };

  // Filter Tasks and Milestones by Course & Project
  const filteredMilestones = milestones.filter((m) => {
    const matchCourse = selectedCourse === "all" || m.course.toUpperCase() === selectedCourse.toUpperCase();
    const matchProject = selectedProject === "all" || m.project === selectedProject;
    return matchCourse && matchProject;
  });

  const filteredTasks = tasks.filter((t) => {
    const matchCourse = selectedCourse === "all" || t.course.toUpperCase() === selectedCourse.toUpperCase();
    const matchProject = selectedProject === "all" || t.project === selectedProject;
    return matchCourse && matchProject;
  });

  return (
    <div className="w-full px-space-lg py-space-lg">
      <div className="flex flex-col w-full gap-space-lg pb-16">
        {/* Top Command Toolbar & Controls */}
        <div className="flex flex-col gap-space-md lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-space-sm">
            {/* Segmented View Toggle */}
            <div className="inline-flex items-center rounded-xl bg-surface-container-high p-1 shadow-xs border border-outline-variant/30">
              <button
                onClick={() => setViewMode("kanban")}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-label-md text-label-md transition-all cursor-pointer ${
                  viewMode === "kanban"
                    ? "bg-surface-container-lowest text-on-surface shadow-xs font-semibold"
                    : "text-secondary hover:text-on-surface"
                }`}
                id="view-kanban-btn"
              >
                <span className="material-symbols-outlined text-[16px]">view_kanban</span>
                <span>Kanban Board</span>
              </button>

              <button
                onClick={() => setViewMode("list")}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-label-md text-label-md transition-all cursor-pointer ${
                  viewMode === "list"
                    ? "bg-surface-container-lowest text-on-surface shadow-xs font-semibold"
                    : "text-secondary hover:text-on-surface"
                }`}
                id="view-list-btn"
              >
                <span className="material-symbols-outlined text-[16px]">format_list_bulleted</span>
                <span>Structured List</span>
              </button>
            </div>

            {/* Vertical Separator */}
            <div className="hidden sm:block w-px h-5 bg-outline-variant/40 mx-1"></div>

            {/* Dynamic Subject & Course Filter Pills with Add / Delete */}
            <div className="flex items-center gap-1 overflow-x-auto py-1 max-w-xl">
              <button
                onClick={() => setSelectedCourse("all")}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-full font-mono-sm text-mono-sm transition-colors cursor-pointer shrink-0 ${
                  selectedCourse === "all"
                    ? "bg-on-surface text-surface shadow-xs font-medium"
                    : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"
                }`}
              >
                <span>All Courses</span>
                <span className="opacity-75">{tasks.length}</span>
              </button>

              {courses.map((c) => (
                <div
                  key={c.id}
                  onClick={() => setSelectedCourse(c.code)}
                  className={`group relative flex items-center gap-1 px-2.5 py-1 rounded-full font-mono-sm text-mono-sm transition-all cursor-pointer shrink-0 ${
                    selectedCourse === c.code
                      ? "bg-on-surface text-surface shadow-xs font-medium"
                      : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${c.color}`}></span>
                  <span>{c.code}</span>
                  <span className="opacity-60 text-[10px]">
                    ({tasks.filter((t) => t.course.toUpperCase() === c.code.toUpperCase()).length})
                  </span>

                  {/* Delete Course Button */}
                  <button
                    onClick={(e) => handleDeleteCourse(c.code, e)}
                    className="ml-1 opacity-0 group-hover:opacity-100 hover:text-error transition-opacity text-[12px] p-0.5 rounded cursor-pointer"
                    title={`Delete course ${c.code}`}
                  >
                    <span className="material-symbols-outlined text-[12px]">close</span>
                  </button>
                </div>
              ))}

              {/* Add New Course Button */}
              <button
                onClick={() => setShowAddCourseModal(true)}
                className="flex items-center gap-1 px-2 py-1 rounded-full border border-dashed border-outline-variant/60 text-secondary hover:text-on-surface hover:border-outline font-mono-sm text-mono-sm transition-colors cursor-pointer shrink-0"
                title="Register a new academic course"
              >
                <span className="material-symbols-outlined text-[13px]">add</span>
                <span>Course</span>
              </button>
            </div>
          </div>

          {/* Action Buttons & Project Selector */}
          <div className="flex flex-wrap items-center gap-space-sm shrink-0">
            {/* Project Dropdown Filter */}
            <div className="flex items-center gap-1.5 bg-surface-container-low border border-outline-variant/30 rounded-lg px-2.5 py-1 text-on-surface font-mono-sm text-mono-sm">
              <span className="material-symbols-outlined text-[15px] text-primary">folder_open</span>
              <select
                value={selectedProject}
                onChange={(e) => setSelectedProject(e.target.value)}
                className="bg-transparent outline-none cursor-pointer max-w-[160px] truncate"
              >
                <option value="all">All Projects</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.name}>
                    {p.name}
                  </option>
                ))}
              </select>
              <button
                onClick={() => setShowAddProjectModal(true)}
                className="hover:text-primary transition-colors p-0.5"
                title="Create Academic Project"
              >
                <span className="material-symbols-outlined text-[15px]">add</span>
              </button>
            </div>

            <button
              onClick={() => setShowNewMilestoneModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container-lowest text-on-surface font-label-md text-label-md shadow-xs border border-outline-variant/30 hover:bg-surface-container transition-all cursor-pointer"
            >
              <span className="material-symbols-outlined text-[17px] text-secondary">flag</span>
              <span>+ Milestone</span>
            </button>

            <button
              onClick={() => setShowNewTaskModal(true)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-on-surface text-surface font-label-md text-label-md shadow-sm hover:opacity-90 transition-all cursor-pointer"
            >
              <span className="material-symbols-outlined text-[17px]">add</span>
              <span>New Task</span>
            </button>
          </div>
        </div>

        {/* Concept Explainer Banner: Difference between Milestones and Tasks */}
        {showConceptExplainer && (
          <div className="rounded-xl bg-surface-container-low/70 border border-outline-variant/30 p-space-md flex flex-col md:flex-row md:items-center justify-between gap-space-md text-on-surface">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0 mt-0.5">
                <span className="material-symbols-outlined text-[18px]">account_tree</span>
              </div>
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center gap-2">
                  <span className="font-headline-sm text-label-md font-semibold text-on-surface">
                    Academic Taxonomy: Projects, Milestones &amp; Tasks
                  </span>
                  <span className="px-1.5 py-0.2 rounded bg-surface-container-highest text-secondary font-mono-sm text-[10px]">
                    Model Guide
                  </span>
                </div>
                <p className="font-body-sm text-body-sm text-secondary leading-relaxed">
                  <strong>Projects</strong> group related syllabus chapters (e.g. <em>CHEM CH1: Organic Mechanisms</em>).
                  <br className="hidden sm:inline" />
                  <strong>Milestones</strong> represent macro goals and exam deadlines (tracked 0–100% via Goals API).
                  <strong>Tasks</strong> are atomic daily execution units managed across the 4-stage Kanban workflow.
                  Clicking any item launches a dedicated AI study session.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
              <button
                onClick={() => setShowConceptExplainer(false)}
                className="px-2 py-1 rounded text-secondary hover:text-on-surface font-mono-sm text-mono-sm cursor-pointer"
                title="Dismiss banner"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Active Semester Milestones Progress Strip */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-mono-sm text-mono-sm uppercase tracking-wider text-outline font-medium">
                Critical Path &amp; Milestone Velocity
              </span>
              <span className="inline-flex items-center px-1.5 py-0.2 rounded bg-surface-container-highest text-on-surface-variant font-mono-sm text-mono-sm">
                Term 2024.1
              </span>
              {selectedProject !== "all" && (
                <span className="inline-flex items-center gap-1 px-2 py-0.2 rounded bg-primary/10 text-primary font-mono-sm text-mono-sm">
                  <span className="material-symbols-outlined text-[13px]">folder</span>
                  {selectedProject}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <span className="font-mono-sm text-mono-sm text-outline">
                {filteredMilestones.length} In Flight
              </span>
              {milestones.length === 0 && !isLoading && (
                <button
                  onClick={handleSeedStarterData}
                  disabled={isSubmitting}
                  className="text-primary hover:underline font-mono-sm text-mono-sm flex items-center gap-1 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[13px]">auto_fix_high</span>
                  Load Sample Syllabus
                </button>
              )}
            </div>
          </div>

          {/* Milestones Grid */}
          {filteredMilestones.length === 0 ? (
            <div className="rounded-xl border border-dashed border-outline-variant/60 bg-surface-container-low/30 p-space-lg flex flex-col items-center justify-center text-center gap-2">
              <span className="material-symbols-outlined text-[28px] text-outline">flag</span>
              <span className="font-headline-sm text-label-md text-on-surface">No milestones yet in this view</span>
              <p className="font-body-sm text-body-sm text-secondary max-w-sm">
                Define semester deliverables, exams, and chapter targets to track progress and launch AI inquiry threads.
              </p>
              <div className="flex items-center gap-2 mt-1">
                <button
                  onClick={() => setShowNewMilestoneModal(true)}
                  className="px-3 py-1.5 rounded-lg bg-surface-container-lowest text-on-surface font-label-md text-label-md shadow-xs border border-outline-variant/40 hover:bg-surface-container"
                >
                  + Add Milestone
                </button>
                {milestones.length === 0 && (
                  <button
                    onClick={handleSeedStarterData}
                    disabled={isSubmitting}
                    className="px-3 py-1.5 rounded-lg bg-primary text-white font-label-md text-label-md shadow-xs hover:opacity-90"
                  >
                    Load Sample Syllabus
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-space-md">
              {filteredMilestones.map((mile) => {
                const percent = Math.round((mile.progress || 0) * 100);
                const badgeColor = getCourseColor(mile.course);
                return (
                  <div
                    key={mile.id}
                    onClick={() => setInspectMilestone(mile)}
                    className="group relative rounded-xl bg-surface-container-lowest p-space-md shadow-xs hover:shadow-md border border-outline-variant/20 transition-all flex flex-col justify-between overflow-hidden cursor-pointer"
                  >
                    {/* Top Progress Bar */}
                    <div className="absolute top-0 left-0 right-0 h-1 bg-surface-container">
                      <div
                        className="h-full bg-primary transition-all duration-300"
                        style={{ width: `${percent}%` }}
                      ></div>
                    </div>

                    <div className="flex flex-col gap-2 pt-1">
                      <div className="flex items-center justify-between">
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-surface-container text-on-surface font-mono-sm text-mono-sm">
                          <span className={`w-1.5 h-1.5 rounded-full ${badgeColor}`}></span>
                          {mile.course}
                        </span>
                        <span className="font-mono-sm text-mono-sm text-secondary flex items-center gap-1">
                          <span className="material-symbols-outlined text-[14px]">event</span>
                          {mile.target_date
                            ? new Date(mile.target_date).toLocaleDateString([], {
                                month: "short",
                                day: "numeric",
                              })
                            : "Semester Target"}
                        </span>
                      </div>

                      <h2 className="font-headline-sm text-headline-sm text-on-surface line-clamp-1 group-hover:text-primary transition-colors">
                        {mile.title}
                      </h2>

                      {mile.project && (
                        <span className="font-mono-sm text-[11px] text-outline flex items-center gap-1 truncate">
                          <span className="material-symbols-outlined text-[12px]">folder</span>
                          {mile.project}
                        </span>
                      )}

                      <p className="font-body-sm text-body-sm text-secondary line-clamp-2">
                        {mile.description || "Active milestone sprint."}
                      </p>
                    </div>

                    <div className="mt-4 pt-3 bg-surface-container-low/50 -mx-space-md -mb-space-md px-space-md pb-space-md flex flex-col gap-2">
                      <div className="flex items-center justify-between font-mono-sm text-mono-sm">
                        <span className="text-on-surface-variant">Syllabus Coverage</span>
                        <span className="font-semibold text-on-surface">{percent}%</span>
                      </div>

                      {/* Launch Study Session Link */}
                      <div className="flex items-center justify-between pt-1 border-t border-outline-variant/20">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleLaunchStudySession(mile.title, mile.course, mile.project);
                          }}
                          className="flex items-center gap-1 px-2 py-1 rounded bg-surface-container-high hover:bg-primary hover:text-white transition-colors text-primary font-mono-sm text-mono-sm font-medium cursor-pointer"
                          title="Open AI chat grounded in this milestone"
                        >
                          <span className="material-symbols-outlined text-[13px]">psychology</span>
                          <span>✦ Launch Study Session</span>
                        </button>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteMilestone(mile.id);
                          }}
                          className="p-1 text-outline hover:text-error rounded hover:bg-surface-container transition-colors cursor-pointer"
                          title="Delete milestone"
                        >
                          <span className="material-symbols-outlined text-[14px]">delete</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* View 1: Academic Kanban Board (4 Columns) */}
        {viewMode === "kanban" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-space-md items-start mt-2">
            {/* COLUMN 1: TO DO */}
            <div className="flex flex-col gap-space-sm rounded-xl bg-surface-container-low/60 p-space-sm border border-outline-variant/20 min-h-[300px]">
              <div className="flex items-center justify-between px-space-xs py-1">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-outline"></div>
                  <span className="font-headline-sm text-headline-sm text-on-surface">To Do</span>
                  <span className="px-1.5 py-0.2 rounded-full bg-surface-container-high text-on-surface-variant font-mono-sm text-mono-sm font-medium">
                    {filteredTasks.filter((t) => t.status === "todo").length}
                  </span>
                </div>
                <button
                  onClick={() => {
                    setNewTaskStatus("todo");
                    setShowNewTaskModal(true);
                  }}
                  className="w-6 h-6 rounded flex items-center justify-center text-outline hover:text-on-surface hover:bg-surface-container transition-colors cursor-pointer"
                  title="Add task to To Do"
                >
                  <span className="material-symbols-outlined text-[16px]">add</span>
                </button>
              </div>

              <div className="flex flex-col gap-space-sm">
                {filteredTasks
                  .filter((t) => t.status === "todo")
                  .map((task) => {
                    const dotColor = getCourseColor(task.course);
                    return (
                      <div
                        key={task.id}
                        className="group flex flex-col gap-2 rounded-xl bg-surface-container-lowest p-space-md shadow-xs hover:shadow-md border border-outline-variant/20 transition-all cursor-pointer"
                      >
                        <div className="flex items-center justify-between">
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-surface-container text-on-surface-variant font-mono-sm text-mono-sm">
                            <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`}></span>
                            {task.course}
                          </span>
                          {task.priority === "urgent" && (
                            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-error-container text-on-error-container font-mono-sm text-mono-sm font-medium">
                              <span className="w-1.5 h-1.5 rounded-full bg-error"></span>
                              Urgent
                            </span>
                          )}
                        </div>

                        <h3 className="font-label-md text-label-md font-semibold text-on-surface group-hover:text-primary transition-colors">
                          {task.title}
                        </h3>

                        {task.project && (
                          <div className="flex items-center gap-1 text-secondary font-mono-sm text-[11px] truncate">
                            <span className="material-symbols-outlined text-[12px] text-outline">folder</span>
                            <span className="truncate">{task.project}</span>
                          </div>
                        )}

                        <div className="flex items-center justify-between pt-2 border-t border-outline-variant/20 font-mono-sm text-mono-sm text-outline">
                          {/* Study Session Button */}
                          <button
                            onClick={() => handleLaunchStudySession(task.title, task.course, task.project)}
                            className="flex items-center gap-1 text-primary hover:underline font-mono-sm text-[11px] font-medium"
                            title="Launch AI Study Session for this task"
                          >
                            <span className="material-symbols-outlined text-[13px]">psychology</span>
                            <span>✦ Study</span>
                          </button>

                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleDeleteTask(task.id)}
                              className="p-1 rounded text-outline hover:text-error transition-colors"
                              title="Delete task"
                            >
                              <span className="material-symbols-outlined text-[14px]">delete</span>
                            </button>
                            <button
                              onClick={() => handleMoveTask(task.id, "in_progress")}
                              className="p-1 rounded hover:bg-surface-container text-primary ml-1"
                              title="Move to In Progress"
                            >
                              <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>

            {/* COLUMN 2: IN PROGRESS */}
            <div className="flex flex-col gap-space-sm rounded-xl bg-surface-container-low/60 p-space-sm border border-outline-variant/20 min-h-[300px]">
              <div className="flex items-center justify-between px-space-xs py-1">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-primary animate-pulse"></div>
                  <span className="font-headline-sm text-headline-sm text-on-surface">
                    In Progress
                  </span>
                  <span className="px-1.5 py-0.2 rounded-full bg-surface-container-high text-on-surface-variant font-mono-sm text-mono-sm font-medium">
                    {filteredTasks.filter((t) => t.status === "in_progress").length}
                  </span>
                </div>
                <button
                  onClick={() => {
                    setNewTaskStatus("in_progress");
                    setShowNewTaskModal(true);
                  }}
                  className="w-6 h-6 rounded flex items-center justify-center text-outline hover:text-on-surface hover:bg-surface-container transition-colors cursor-pointer"
                  title="Add task to In Progress"
                >
                  <span className="material-symbols-outlined text-[16px]">add</span>
                </button>
              </div>

              <div className="flex flex-col gap-space-sm">
                {filteredTasks
                  .filter((t) => t.status === "in_progress")
                  .map((task) => {
                    const dotColor = getCourseColor(task.course);
                    return (
                      <div
                        key={task.id}
                        className="group flex flex-col gap-2 rounded-xl bg-surface-container-lowest p-space-md shadow-xs hover:shadow-md border border-outline-variant/20 transition-all cursor-pointer"
                      >
                        <div className="flex items-center justify-between">
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-surface-container text-on-surface-variant font-mono-sm text-mono-sm">
                            <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`}></span>
                            {task.course}
                          </span>
                          <span className="font-mono-sm text-mono-sm text-primary font-medium">
                            Active Sprint
                          </span>
                        </div>

                        <h3 className="font-label-md text-label-md font-semibold text-on-surface group-hover:text-primary transition-colors">
                          {task.title}
                        </h3>

                        {task.project && (
                          <div className="flex items-center gap-1 text-secondary font-mono-sm text-[11px] truncate">
                            <span className="material-symbols-outlined text-[12px] text-outline">folder</span>
                            <span className="truncate">{task.project}</span>
                          </div>
                        )}

                        <div className="flex items-center justify-between pt-2 border-t border-outline-variant/20 font-mono-sm text-mono-sm text-outline">
                          <button
                            onClick={() => handleLaunchStudySession(task.title, task.course, task.project)}
                            className="flex items-center gap-1 text-primary hover:underline font-mono-sm text-[11px] font-medium"
                            title="Launch AI Study Session for this task"
                          >
                            <span className="material-symbols-outlined text-[13px]">psychology</span>
                            <span>✦ Study</span>
                          </button>

                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleMoveTask(task.id, "todo")}
                              className="p-1 rounded hover:bg-surface-container text-outline"
                              title="Move back to To Do"
                            >
                              <span className="material-symbols-outlined text-[14px]">arrow_back</span>
                            </button>
                            <button
                              onClick={() => handleMoveTask(task.id, "review")}
                              className="p-1 rounded hover:bg-surface-container text-primary ml-1"
                              title="Move to Peer Review"
                            >
                              <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>

            {/* COLUMN 3: PEER REVIEW */}
            <div className="flex flex-col gap-space-sm rounded-xl bg-surface-container-low/60 p-space-sm border border-outline-variant/20 min-h-[300px]">
              <div className="flex items-center justify-between px-space-xs py-1">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-tertiary"></div>
                  <span className="font-headline-sm text-headline-sm text-on-surface">
                    Peer Review
                  </span>
                  <span className="px-1.5 py-0.2 rounded-full bg-surface-container-high text-on-surface-variant font-mono-sm text-mono-sm font-medium">
                    {filteredTasks.filter((t) => t.status === "review").length}
                  </span>
                </div>
                <button
                  onClick={() => {
                    setNewTaskStatus("review");
                    setShowNewTaskModal(true);
                  }}
                  className="w-6 h-6 rounded flex items-center justify-center text-outline hover:text-on-surface hover:bg-surface-container transition-colors cursor-pointer"
                  title="Add task to Review"
                >
                  <span className="material-symbols-outlined text-[16px]">add</span>
                </button>
              </div>

              <div className="flex flex-col gap-space-sm">
                {filteredTasks
                  .filter((t) => t.status === "review")
                  .map((task) => {
                    const dotColor = getCourseColor(task.course);
                    return (
                      <div
                        key={task.id}
                        className="group flex flex-col gap-2 rounded-xl bg-surface-container-lowest p-space-md shadow-xs hover:shadow-md border border-outline-variant/20 transition-all cursor-pointer"
                      >
                        <div className="flex items-center justify-between">
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-surface-container text-on-surface-variant font-mono-sm text-mono-sm">
                            <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`}></span>
                            {task.course}
                          </span>
                          <span className="font-mono-sm text-mono-sm text-secondary">Pending</span>
                        </div>

                        <h3 className="font-label-md text-label-md font-semibold text-on-surface group-hover:text-primary transition-colors">
                          {task.title}
                        </h3>

                        {task.project && (
                          <div className="flex items-center gap-1 text-secondary font-mono-sm text-[11px] truncate">
                            <span className="material-symbols-outlined text-[12px] text-outline">folder</span>
                            <span className="truncate">{task.project}</span>
                          </div>
                        )}

                        <div className="flex items-center justify-between pt-2 border-t border-outline-variant/20 font-mono-sm text-mono-sm text-outline">
                          <button
                            onClick={() => handleLaunchStudySession(task.title, task.course, task.project)}
                            className="flex items-center gap-1 text-primary hover:underline font-mono-sm text-[11px] font-medium"
                            title="Launch AI Study Session for this task"
                          >
                            <span className="material-symbols-outlined text-[13px]">psychology</span>
                            <span>✦ Study</span>
                          </button>

                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleMoveTask(task.id, "in_progress")}
                              className="p-1 rounded hover:bg-surface-container text-outline"
                              title="Move back to In Progress"
                            >
                              <span className="material-symbols-outlined text-[14px]">arrow_back</span>
                            </button>
                            <button
                              onClick={() => handleMoveTask(task.id, "done")}
                              className="p-1 rounded hover:bg-surface-container text-emerald-600 ml-1"
                              title="Mark as Done"
                            >
                              <span className="material-symbols-outlined text-[14px]">check</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>

            {/* COLUMN 4: MASTERED / DONE */}
            <div className="flex flex-col gap-space-sm rounded-xl bg-surface-container-low/60 p-space-sm border border-outline-variant/20 min-h-[300px]">
              <div className="flex items-center justify-between px-space-xs py-1">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                  <span className="font-headline-sm text-headline-sm text-on-surface">
                    Mastered / Done
                  </span>
                  <span className="px-1.5 py-0.2 rounded-full bg-surface-container-high text-on-surface-variant font-mono-sm text-mono-sm font-medium">
                    {filteredTasks.filter((t) => t.status === "done").length}
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-space-sm">
                {filteredTasks
                  .filter((t) => t.status === "done")
                  .map((task) => {
                    const dotColor = getCourseColor(task.course);
                    return (
                      <div
                        key={task.id}
                        className="group flex flex-col gap-2 rounded-xl bg-surface-container-lowest p-space-md shadow-xs border border-outline-variant/20 transition-all opacity-85 hover:opacity-100"
                      >
                        <div className="flex items-center justify-between">
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-surface-container text-on-surface-variant font-mono-sm text-mono-sm">
                            <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`}></span>
                            {task.course}
                          </span>
                          <span className="material-symbols-outlined text-[16px] text-emerald-600">
                            check_circle
                          </span>
                        </div>

                        <h3 className="font-label-md text-label-md font-semibold text-on-surface line-through text-outline">
                          {task.title}
                        </h3>

                        <div className="flex items-center justify-between pt-2 border-t border-outline-variant/20 font-mono-sm text-mono-sm text-outline">
                          <span className="text-emerald-700 font-medium text-[11px]">Completed</span>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleMoveTask(task.id, "todo")}
                              className="p-1 rounded text-outline hover:text-primary transition-colors text-[11px]"
                              title="Reopen task"
                            >
                              <span className="material-symbols-outlined text-[14px]">replay</span>
                            </button>
                            <button
                              onClick={() => handleDeleteTask(task.id)}
                              className="p-1 rounded text-outline hover:text-error transition-colors"
                              title="Delete task"
                            >
                              <span className="material-symbols-outlined text-[14px]">delete</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        ) : (
          /* View 2: Structured List Table */
          <div className="bg-surface-container-lowest rounded-xl shadow-xs border border-outline-variant/30 overflow-hidden flex flex-col mt-2">
            <div className="grid grid-cols-12 px-space-md py-2.5 bg-surface-container-low font-mono-sm text-mono-sm text-outline uppercase tracking-wider border-b border-outline-variant/20">
              <div className="col-span-1 text-center">State</div>
              <div className="col-span-5">Task Title &amp; Project</div>
              <div className="col-span-2">Course Taxonomy</div>
              <div className="col-span-2">Priority</div>
              <div className="col-span-2 text-right">Actions</div>
            </div>

            {filteredTasks.length === 0 ? (
              <div className="py-12 flex flex-col items-center justify-center text-center gap-2">
                <span className="material-symbols-outlined text-[28px] text-outline">task_alt</span>
                <span className="font-headline-sm text-label-md text-on-surface">No tasks found</span>
                <p className="font-body-sm text-body-sm text-secondary">
                  No tasks matched your active course and project filters.
                </p>
              </div>
            ) : (
              filteredTasks.map((task) => {
                const dotColor = getCourseColor(task.course);
                return (
                  <div
                    key={task.id}
                    className="grid grid-cols-12 px-space-md py-3 items-center border-b border-outline-variant/15 hover:bg-surface-container-low/40 transition-colors"
                  >
                    <div className="col-span-1 flex items-center justify-center">
                      <input
                        type="checkbox"
                        checked={task.status === "done"}
                        onChange={() =>
                          handleMoveTask(task.id, task.status === "done" ? "todo" : "done")
                        }
                        className="w-4 h-4 rounded accent-primary cursor-pointer"
                      />
                    </div>
                    <div className="col-span-5 flex flex-col min-w-0 pr-4">
                      <span
                        className={`font-label-md text-label-md font-medium truncate ${
                          task.status === "done" ? "line-through text-outline" : "text-on-surface"
                        }`}
                      >
                        {task.title}
                      </span>
                      {task.project && (
                        <span className="font-mono-sm text-[11px] text-outline flex items-center gap-1 mt-0.5 truncate">
                          <span className="material-symbols-outlined text-[12px]">folder</span>
                          {task.project}
                        </span>
                      )}
                    </div>
                    <div className="col-span-2">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-surface-container text-on-surface-variant font-mono-sm text-mono-sm">
                        <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`}></span>
                        {task.course}
                      </span>
                    </div>
                    <div className="col-span-2">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded font-mono-sm text-mono-sm uppercase text-[10px] ${
                          task.priority === "urgent"
                            ? "bg-error-container text-on-error-container font-semibold"
                            : task.priority === "high"
                            ? "bg-amber-100 text-amber-800"
                            : "bg-surface-container-high text-secondary"
                        }`}
                      >
                        {task.priority}
                      </span>
                    </div>
                    <div className="col-span-2 flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleLaunchStudySession(task.title, task.course, task.project)}
                        className="flex items-center gap-1 text-primary hover:underline font-mono-sm text-mono-sm"
                        title="Study this task in AI Chat"
                      >
                        <span className="material-symbols-outlined text-[14px]">psychology</span>
                        <span>Study</span>
                      </button>
                      <button
                        onClick={() => handleDeleteTask(task.id)}
                        className="p-1 rounded text-outline hover:text-error hover:bg-surface-container transition-colors cursor-pointer"
                        title="Delete task"
                      >
                        <span className="material-symbols-outlined text-[16px]">delete</span>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Modal: Add New Course */}
        {showAddCourseModal && (
          <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-surface-container-lowest rounded-xl p-space-lg shadow-xl max-w-md w-full flex flex-col gap-space-md border border-outline-variant/30">
              <div className="flex items-center justify-between">
                <h3 className="font-headline-sm text-headline-sm text-on-surface">
                  Register Academic Course
                </h3>
                <button
                  onClick={() => setShowAddCourseModal(false)}
                  className="p-1 text-secondary hover:text-on-surface rounded cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>

              <form onSubmit={handleAddCourse} className="flex flex-col gap-space-sm">
                <div className="flex flex-col gap-1">
                  <label className="font-label-sm text-label-sm text-secondary">
                    Course Code (e.g. BIO101, ECON201)
                  </label>
                  <input
                    type="text"
                    value={newCourseCode}
                    onChange={(e) => setNewCourseCode(e.target.value)}
                    placeholder="e.g. BIO101"
                    autoFocus
                    required
                    className="w-full px-3 py-2 rounded-lg bg-surface-container-low text-on-surface font-mono-sm text-mono-sm outline-none border border-outline-variant/30 focus:border-primary uppercase"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="font-label-sm text-label-sm text-secondary">
                    Full Course Title
                  </label>
                  <input
                    type="text"
                    value={newCourseName}
                    onChange={(e) => setNewCourseName(e.target.value)}
                    placeholder="e.g. Molecular Biology"
                    className="w-full px-3 py-2 rounded-lg bg-surface-container-low text-on-surface font-body-md text-body-md outline-none border border-outline-variant/30 focus:border-primary"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="font-label-sm text-label-sm text-secondary">Badge Color</label>
                  <div className="flex items-center gap-2 flex-wrap">
                    {COLOR_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setNewCourseColor(opt.value)}
                        className={`w-7 h-7 rounded-full ${opt.value} flex items-center justify-center transition-transform cursor-pointer ${
                          newCourseColor === opt.value ? "ring-2 ring-on-surface scale-110" : ""
                        }`}
                        title={opt.label}
                      >
                        {newCourseColor === opt.value && (
                          <span className="material-symbols-outlined text-white text-[14px]">
                            check
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowAddCourseModal(false)}
                    className="px-3 py-1.5 rounded-lg text-secondary hover:text-on-surface text-label-md"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 rounded-lg bg-on-surface text-surface hover:opacity-90 font-label-md text-label-md shadow-sm"
                  >
                    Add Course
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Add New Academic Project */}
        {showAddProjectModal && (
          <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-surface-container-lowest rounded-xl p-space-lg shadow-xl max-w-md w-full flex flex-col gap-space-md border border-outline-variant/30">
              <div className="flex items-center justify-between">
                <h3 className="font-headline-sm text-headline-sm text-on-surface">
                  Create Academic Project
                </h3>
                <button
                  onClick={() => setShowAddProjectModal(false)}
                  className="p-1 text-secondary hover:text-on-surface rounded cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>

              <form onSubmit={handleAddProject} className="flex flex-col gap-space-sm">
                <div className="flex flex-col gap-1">
                  <label className="font-label-sm text-label-sm text-secondary">
                    Project Name
                  </label>
                  <input
                    type="text"
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    placeholder="e.g. CHEM CH2: Stereochemistry"
                    autoFocus
                    required
                    className="w-full px-3 py-2 rounded-lg bg-surface-container-low text-on-surface font-body-md text-body-md outline-none border border-outline-variant/30 focus:border-primary"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="font-label-sm text-label-sm text-secondary">Parent Course</label>
                  <select
                    value={newProjectCourse}
                    onChange={(e) => setNewProjectCourse(e.target.value)}
                    className="w-full px-2 py-2 rounded-lg bg-surface-container-low text-on-surface font-mono-sm text-mono-sm outline-none border border-outline-variant/30"
                  >
                    {courses.map((c) => (
                      <option key={c.id} value={c.code}>
                        {c.code} — {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="font-label-sm text-label-sm text-secondary">
                    Scope &amp; Description
                  </label>
                  <textarea
                    value={newProjectDesc}
                    onChange={(e) => setNewProjectDesc(e.target.value)}
                    rows={2}
                    placeholder="Brief description of chapters, p-sets, or lab scope"
                    className="w-full px-3 py-2 rounded-lg bg-surface-container-low text-on-surface font-body-sm text-body-sm outline-none border border-outline-variant/30 resize-none"
                  ></textarea>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowAddProjectModal(false)}
                    className="px-3 py-1.5 rounded-lg text-secondary hover:text-on-surface text-label-md"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 rounded-lg bg-on-surface text-surface hover:opacity-90 font-label-md text-label-md shadow-sm"
                  >
                    Create Project
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: New Task */}
        {showNewTaskModal && (
          <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-surface-container-lowest rounded-xl p-space-lg shadow-xl max-w-md w-full flex flex-col gap-space-md border border-outline-variant/30">
              <div className="flex items-center justify-between">
                <h3 className="font-headline-sm text-headline-sm text-on-surface">
                  Create Study Task
                </h3>
                <button
                  onClick={() => setShowNewTaskModal(false)}
                  className="p-1 text-secondary hover:text-on-surface rounded cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>

              <form onSubmit={handleCreateTask} className="flex flex-col gap-space-sm">
                <div className="flex flex-col gap-1">
                  <label className="font-label-sm text-label-sm text-secondary">Task Title</label>
                  <input
                    type="text"
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    placeholder="e.g. Derive Stokes theorem curl identity"
                    autoFocus
                    required
                    className="w-full px-3 py-2 rounded-lg bg-surface-container-low text-on-surface font-body-md text-body-md outline-none border border-outline-variant/30 focus:border-primary"
                  />
                </div>

                <div className="grid grid-cols-2 gap-space-sm">
                  <div className="flex flex-col gap-1">
                    <label className="font-label-sm text-label-sm text-secondary">Course</label>
                    <select
                      value={newTaskCourse}
                      onChange={(e) => {
                        setNewTaskCourse(e.target.value);
                        const matchProj = projects.find((p) => p.courseCode === e.target.value);
                        if (matchProj) setNewTaskProject(matchProj.name);
                      }}
                      className="w-full px-2 py-2 rounded-lg bg-surface-container-low text-on-surface font-mono-sm text-mono-sm outline-none border border-outline-variant/30"
                    >
                      {courses.map((c) => (
                        <option key={c.id} value={c.code}>
                          {c.code}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="font-label-sm text-label-sm text-secondary">Project</label>
                    <select
                      value={newTaskProject}
                      onChange={(e) => setNewTaskProject(e.target.value)}
                      className="w-full px-2 py-2 rounded-lg bg-surface-container-low text-on-surface font-mono-sm text-mono-sm outline-none border border-outline-variant/30"
                    >
                      {projects.map((p) => (
                        <option key={p.id} value={p.name}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-space-sm">
                  <div className="flex flex-col gap-1">
                    <label className="font-label-sm text-label-sm text-secondary">Initial Stage</label>
                    <select
                      value={newTaskStatus}
                      onChange={(e) => setNewTaskStatus(e.target.value as any)}
                      className="w-full px-2 py-2 rounded-lg bg-surface-container-low text-on-surface font-mono-sm text-mono-sm outline-none border border-outline-variant/30"
                    >
                      <option value="todo">To Do</option>
                      <option value="in_progress">In Progress</option>
                      <option value="review">Peer Review</option>
                      <option value="done">Mastered / Done</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="font-label-sm text-label-sm text-secondary">Priority</label>
                    <select
                      value={newTaskPriority}
                      onChange={(e) => setNewTaskPriority(e.target.value as any)}
                      className="w-full px-2 py-2 rounded-lg bg-surface-container-low text-on-surface font-mono-sm text-mono-sm outline-none border border-outline-variant/30"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="urgent">Urgent</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowNewTaskModal(false)}
                    className="px-3 py-1.5 rounded-lg text-secondary hover:text-on-surface text-label-md"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-4 py-1.5 rounded-lg bg-on-surface text-surface hover:opacity-90 font-label-md text-label-md shadow-sm"
                  >
                    {isSubmitting ? "Saving..." : "Add Task"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: New Milestone */}
        {showNewMilestoneModal && (
          <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-surface-container-lowest rounded-xl p-space-lg shadow-xl max-w-md w-full flex flex-col gap-space-md border border-outline-variant/30">
              <div className="flex items-center justify-between">
                <h3 className="font-headline-sm text-headline-sm text-on-surface">
                  Create Semester Milestone
                </h3>
                <button
                  onClick={() => setShowNewMilestoneModal(false)}
                  className="p-1 text-secondary hover:text-on-surface rounded cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>

              <form onSubmit={handleCreateMilestone} className="flex flex-col gap-space-sm">
                <div className="flex flex-col gap-1">
                  <label className="font-label-sm text-label-sm text-secondary">
                    Milestone Title
                  </label>
                  <input
                    type="text"
                    value={newMileTitle}
                    onChange={(e) => setNewMileTitle(e.target.value)}
                    placeholder="e.g. Physics Final Exam Preparation"
                    autoFocus
                    required
                    className="w-full px-3 py-2 rounded-lg bg-surface-container-low text-on-surface font-body-md text-body-md outline-none border border-outline-variant/30 focus:border-primary"
                  />
                </div>

                <div className="grid grid-cols-2 gap-space-sm">
                  <div className="flex flex-col gap-1">
                    <label className="font-label-sm text-label-sm text-secondary">Course</label>
                    <select
                      value={newMileCourse}
                      onChange={(e) => {
                        setNewMileCourse(e.target.value);
                        const matchProj = projects.find((p) => p.courseCode === e.target.value);
                        if (matchProj) setNewMileProject(matchProj.name);
                      }}
                      className="w-full px-2 py-2 rounded-lg bg-surface-container-low text-on-surface font-mono-sm text-mono-sm outline-none border border-outline-variant/30"
                    >
                      {courses.map((c) => (
                        <option key={c.id} value={c.code}>
                          {c.code}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="font-label-sm text-label-sm text-secondary">Project</label>
                    <select
                      value={newMileProject}
                      onChange={(e) => setNewMileProject(e.target.value)}
                      className="w-full px-2 py-2 rounded-lg bg-surface-container-low text-on-surface font-mono-sm text-mono-sm outline-none border border-outline-variant/30"
                    >
                      {projects.map((p) => (
                        <option key={p.id} value={p.name}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="font-label-sm text-label-sm text-secondary">
                    Syllabus Scope &amp; Target Description
                  </label>
                  <textarea
                    value={newMileDesc}
                    onChange={(e) => setNewMileDesc(e.target.value)}
                    rows={2}
                    placeholder="Key chapters, theorems, and laboratory items"
                    className="w-full px-3 py-2 rounded-lg bg-surface-container-low text-on-surface font-body-sm text-body-sm outline-none border border-outline-variant/30 resize-none"
                  ></textarea>
                </div>

                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between font-label-sm text-label-sm text-secondary">
                    <span>Initial Syllabus Coverage</span>
                    <span className="font-semibold text-on-surface">{newMileProgress}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={newMileProgress}
                    onChange={(e) => setNewMileProgress(Number(e.target.value))}
                    className="w-full accent-primary cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowNewMilestoneModal(false)}
                    className="px-3 py-1.5 rounded-lg text-secondary hover:text-on-surface text-label-md"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-4 py-1.5 rounded-lg bg-on-surface text-surface hover:opacity-90 font-label-md text-label-md shadow-sm"
                  >
                    {isSubmitting ? "Saving..." : "Add Milestone"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Milestone Inspector Drawer / Slide-Over */}
        {inspectMilestone && (
          <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-surface-container-lowest rounded-xl p-space-lg shadow-2xl max-w-lg w-full flex flex-col gap-space-md border border-outline-variant/30 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-surface-container text-on-surface font-mono-sm text-mono-sm">
                  <span className={`w-2 h-2 rounded-full ${getCourseColor(inspectMilestone.course)}`}></span>
                  {inspectMilestone.course}
                </span>
                <button
                  onClick={() => setInspectMilestone(null)}
                  className="p-1 text-secondary hover:text-on-surface rounded cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>

              <div className="flex flex-col gap-1">
                <h3 className="font-headline-sm text-headline-sm text-on-surface">
                  {inspectMilestone.title}
                </h3>
                {inspectMilestone.project && (
                  <span className="font-mono-sm text-mono-sm text-primary flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px]">folder</span>
                    Project: {inspectMilestone.project}
                  </span>
                )}
                <p className="font-body-md text-body-md text-secondary mt-1">
                  {inspectMilestone.description || "Active milestone sprint target."}
                </p>
              </div>

              {/* Progress Slider */}
              <div className="flex flex-col gap-2 p-space-sm bg-surface-container-low rounded-lg border border-outline-variant/20">
                <div className="flex items-center justify-between font-mono-sm text-mono-sm">
                  <span className="text-secondary">Progress Tracking</span>
                  <span className="font-bold text-on-surface">
                    {Math.round(inspectMilestone.progress * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={Math.round(inspectMilestone.progress * 100)}
                  onChange={(e) =>
                    handleUpdateMilestoneProgress(inspectMilestone.id, Number(e.target.value))
                  }
                  className="w-full accent-primary cursor-pointer"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col gap-2 pt-2">
                <button
                  onClick={() => {
                    handleLaunchStudySession(
                      inspectMilestone.title,
                      inspectMilestone.course,
                      inspectMilestone.project
                    );
                    setInspectMilestone(null);
                  }}
                  className="w-full py-2.5 rounded-lg bg-primary text-white font-label-md text-label-md font-medium shadow-md hover:opacity-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[18px]">psychology</span>
                  <span>✦ Launch AI Study Session in Chat</span>
                </button>

                <div className="flex items-center justify-between pt-1">
                  <button
                    onClick={() => handleDeleteMilestone(inspectMilestone.id)}
                    className="text-error hover:underline font-mono-sm text-mono-sm flex items-center gap-1 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[14px]">delete</span>
                    <span>Delete Milestone</span>
                  </button>
                  <button
                    onClick={() => setInspectMilestone(null)}
                    className="px-3 py-1 rounded-lg text-secondary hover:text-on-surface font-label-md text-label-md"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
