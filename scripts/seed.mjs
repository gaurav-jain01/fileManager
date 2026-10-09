import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/next-file";

const FileSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: "" },
    url: { type: String, required: true, trim: true },
    type: { type: String, required: true, default: "link" },
    category: { type: String, trim: true, default: "General" },
    tags: { type: [String], default: [] },
    notes: { type: String, trim: true, default: "" },
    favorite: { type: Boolean, default: false },
    lastOpenedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

const UserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    profileImage: { type: String, default: "" },
    authProvider: { type: String, default: "email" },
  },
  { timestamps: true }
);

async function seed() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log("✅ Connected to MongoDB");

    const File = mongoose.model("File", FileSchema);
    const User = mongoose.model("User", UserSchema);

    // Clear existing data
    await File.deleteMany({});
    await User.deleteMany({});
    console.log("🗑️  Cleared existing data");

    // Seed user
    const user = await User.create({
      name: "Gaurav Jain",
      email: "example@gmail.com",
      profileImage: "",
      authProvider: "google",
    });
    console.log("👤 Created user:", user.name);

    // Seed files
    const files = await File.insertMany([
      {
        title: "BTech Attendance",
        description: "Semester 1 Section B attendance sheet",
        url: "https://docs.google.com/spreadsheets/d/xxxxx",
        type: "google_sheet",
        category: "Teaching",
        tags: ["btech", "attendance", "semester-1"],
        notes: "Updated after every lecture",
        favorite: false,
      },
      {
        title: "MTech Syllabus 2024",
        description: "Complete syllabus for MTech Computer Science program",
        url: "https://docs.google.com/document/d/yyyyy",
        type: "google_doc",
        category: "Teaching",
        tags: ["mtech", "syllabus", "2024"],
        notes: "Approved by Academic Council",
        favorite: true,
      },
      {
        title: "Research Paper Draft",
        description: "Deep Learning for NLP - Conference submission",
        url: "https://docs.google.com/document/d/zzzzz",
        type: "google_doc",
        category: "Research",
        tags: ["research", "deep-learning", "nlp", "paper"],
        notes: "Deadline: March 15",
        favorite: true,
      },
      {
        title: "Lab Schedule",
        description: "Computer Lab booking schedule for Semester 1",
        url: "https://docs.google.com/spreadsheets/d/aaaaa",
        type: "google_sheet",
        category: "Admin",
        tags: ["lab", "schedule", "semester-1"],
        notes: "",
        favorite: false,
      },
      {
        title: "Student Project Presentations",
        description: "Slide deck for final year project presentations",
        url: "https://docs.google.com/presentation/d/bbbbb",
        type: "google_slide",
        category: "Teaching",
        tags: ["presentations", "projects", "final-year"],
        notes: "Presentation date: April 10",
        favorite: false,
      },
      {
        title: "Budget Report 2024",
        description: "Department annual budget and expenditure report",
        url: "https://drive.google.com/file/d/ccccc",
        type: "pdf",
        category: "Admin",
        tags: ["budget", "report", "2024", "finance"],
        notes: "Submitted to Dean's office",
        favorite: false,
      },
      {
        title: "Conference Video Recording",
        description: "Keynote talk at International AI Conference",
        url: "https://drive.google.com/file/d/ddddd",
        type: "video",
        category: "Research",
        tags: ["conference", "ai", "keynote", "video"],
        notes: "Duration: 45 minutes",
        favorite: true,
      },
      {
        title: "Course Feedback Form",
        description: "Anonymous feedback form for students",
        url: "https://docs.google.com/forms/d/eeeee",
        type: "google_form",
        category: "Teaching",
        tags: ["feedback", "form", "students"],
        notes: "Shared at end of semester",
        favorite: false,
      },
      {
        title: "Meeting Notes - Faculty",
        description: "Weekly faculty meeting minutes",
        url: "https://docs.google.com/document/d/fffff",
        type: "google_doc",
        category: "Admin",
        tags: ["meeting", "faculty", "minutes"],
        notes: "Every Wednesday 3 PM",
        favorite: false,
      },
      {
        title: "GitHub Repository - ML Project",
        description: "Machine learning project codebase and documentation",
        url: "https://github.com/gaurav/ml-project",
        type: "link",
        category: "Research",
        tags: ["github", "machine-learning", "code", "project"],
        notes: "Public repo with MIT license",
        favorite: true,
      },
    ]);

    console.log(`📁 Created ${files.length} files`);
    console.log("\n🎉 Seed completed successfully!");

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error("❌ Seed failed:", error.message);
    process.exit(1);
  }
}

seed();
