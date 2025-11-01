# TaskHub AI - The Story

## Inspiration

We all have the same problem.

Too many tasks. Too little time. Nothing gets finished.

We read about something interesting: when you put a task on your calendar, you actually do it. Science backs this up. It's called the "calendaring approach."

[Check out the research here](https://www.calendar.com/blog/breaking-procrastination-calendaring-approach-to-get-things-done/)

But we looked at productivity apps. None of them connect task capture to your calendar easily. They make it hard.

So we thought: what if we made it super easy to capture tasks AND automatically put them on your calendar?

That's how TaskHub was born.

---

## What It Does

TaskHub is a Chrome extension that helps you capture tasks and organize them on your calendar.

### Three Ways to Capture

**1. Voice**
Click a button. Say what you need to do.

"I need to finish the report by Friday."

Done.

**2. Text**
Write a quick note. Type what you need to remember.

**3. Screen**
See something on your screen you need to do? Take a screenshot of it.

### AI Organizes Everything

You capture. The AI figures out:
- What is the task?
- How important is it?
- When is it due?
- What project is it?

Example:
- You say: "Call the marketing team about Q4 campaign by next Wednesday"
- AI creates: Task title, sets priority to "High", deadline to "Next Wednesday", project as "Q4 Campaign"

All automatic. All in seconds.

### It Goes On Your Calendar

Your task appears on your Google Calendar. Not in a list. On your actual calendar.

You see it scheduled. You know what you need to do. You finish it because it's real.

This is where the science works.

---

## How We Built It

### The Tech Stack

- **Chrome Extension Framework** - Built as a Chrome plugin for easy access
- **Google Gemini API** - Powers the AI that understands your tasks
- **Google Calendar API** - Syncs tasks directly to your calendar
- **Google Tasks API** - Stores task details
- **Local Storage** - Keeps everything on your computer

### The Three Main Features

**1. Capture Module**
- Voice recording with Web Audio API
- Text input form
- Screenshot capture using Chrome APIs
- All stored locally, not in the cloud

**2. AI Processing**
- Google Gemini processes your raw input
- Extracts task name, priority, deadline, project
- Understands natural language (you can talk like a human)
- Runs fast because it's intelligent, not just pattern matching

**3. Calendar Sync**
- Automatically creates calendar events
- Syncs with Google Calendar
- Updates Google Tasks
- Everything stays in sync

### Why Local Storage?

We chose to keep data on your computer. Not the cloud.

Why?
- Your privacy is safe
- Works offline
- Faster (no waiting for server)
- You control your data

---

## Challenges We Ran Into

### 1. Chrome Extension Limitations

Building a Chrome extension is tricky. We had to work within Chrome's rules for security.

**Challenge:** How to capture voice and screen safely?

**Solution:** Used Chrome APIs that are designed for this. Kept everything local.

### 2. AI Understanding Natural Language

People don't talk like robots. They say things in messy ways.

**Challenge:** "Finish report by Friday" vs "I gotta get the report done, like, by next Friday, maybe?"

**Solution:** Used Google's advanced AI that understands real human language, not just structured input.

### 3. Calendar Sync Issues

Google Calendar has its own rules. We had to make sure our tasks fit perfectly.

**Challenge:** Making sure dates, times, and priorities sync correctly without errors.

**Solution:** Tested heavily. Built error handling. Made sure data doesn't get lost.

### 4. Privacy While Using Cloud AI

We use Google's AI (it's in the cloud). But we wanted to keep data local.

**Challenge:** How to use AI without sending all your data to the cloud?

**Solution:** Processed data locally when possible. Only sent what was needed to AI. Kept results on your computer.

### 5. User Experience

Making it simple was hard. We cut a lot of features to keep it simple.

**Challenge:** We had 20 ideas. But simple is better than full.

**Solution:** Said "no" to most things. Kept only the core: capture, organize, calendar.

---

## Accomplishments That We're Proud Of

### 1. Real Privacy in a Cloud AI World

Most apps track everything. We don't.

We're proud we found a way to use Google's smart AI without keeping your data. Your voice, your tasks, your captures—they stay on your computer.

### 2. Three Capture Methods

Voice + Text + Screen capture.

Most apps do one thing. We do three. And they're all equally easy.

### 3. AI That Understands You

We didn't build a system that matches patterns. We built one that *understands*.

You can say: "Call Sarah about the budget thing by EOW"

The AI figures out:
- Task: "Call Sarah about budget"
- Deadline: End of week
- Priority: Medium (implied)

That's real intelligence.

### 4. Zero Friction

From idea to calendar in 5 seconds.

No forms. No clicking through 10 menus. No "save" buttons. Just: capture → organize → done.

### 5. Calendar-First Design

We didn't bolt calendar on as an afterthought.

We built TaskHub knowing calendar is the core. Everything else serves that.

### 6. Built in a Hackathon

We did all this in a few weeks. With Google's APIs. For a hackathon challenge.

And it works.

---

## What We Learned

### 1. Simplicity Wins

We started with 50 ideas. We ended with 5 features. The simple version is way better.

People don't want features. They want the problem solved.

### 2. The Calendar Research Is Real

We read about the calendaring approach. We weren't sure if it would matter.

It does. When your task is on your calendar, it becomes real. People actually finish things.

This isn't marketing. This is science.

### 3. Privacy Matters More Than We Thought

We planned privacy as a feature. But people care about it way more.

Everyone is tired of being tracked. Building privacy-first isn't a feature—it's a requirement.

### 4. Voice Capture Changes Everything

Text is okay. Voice is magic.

When you can just *talk*, the friction disappears. You capture more. You finish more.

### 5. Chrome Is the Right Place

We debated: should this be a web app? Mobile app? Slack bot?

Chrome extension is right because people are already there. Working. Browsing. The tool is one click away.

### 6. Google's AI Is Powerful

We were worried: would the AI understand messy human language?

It does. Google Gemini understands context, nuance, and intent. It's genuinely smart.

### 7. Local-First Architecture Works

We thought: keeping data local will make it slow or complicated.

It doesn't. It's fast. It's simple. And it's private.

---

## What's Next for TaskHub

We're just getting started.

### Near Term (Next 3 months)

**1. Recurring Tasks**
Set up tasks that repeat. Daily standup. Weekly planning. Monthly reviews.

**2. Task Templates**
Common tasks ready to go. Like: "Prepare presentation for meeting"

**3. Better Priority System**
More intelligent priority assignment. Learn from your behavior. Suggest priorities.

**4. Keyboard Shortcuts**
Power users want speed. Add hotkeys for capture, search, organize.

### Medium Term (3-6 months)

**1. Automated Timesheets**
For hourly workers and freelancers.

You complete a task. TaskHub logs the time. At the end of the week, your timesheet is ready.

**2. Team Collaboration**
Share projects with your team. Assign tasks. See who's working on what.

**3. Smart Scheduling**
AI suggests the best time to do each task.

Based on: your calendar, your productivity patterns, task difficulty, deadlines.

**4. Mobile App**
Android and iOS versions. Capture tasks on the go.

### Long Term (6+ months)

**1. More Integrations**
- Outlook Calendar
- Notion
- Asana
- Slack
- Microsoft Teams

**2. Productivity Analytics**
Dashboard showing:
- Tasks completed per week
- Completion rates by project
- Peak productivity hours
- Time spent per task
- Trends over time

**3. AI Insights**
The AI learns about you. It suggests:
- "You usually work on reports on Tuesday. Should we schedule this then?"
- "You're behind on this project. Need help?"
- "You have 3 urgent tasks. Which one first?"

**4. Calendar Predictions**
AI looks at your calendar and tasks. It tells you:
- "You don't have time for all this this week"
- "Next week looks empty. Good time for big projects"
- "You should block time for deep work"

**5. The Open Ecosystem**
Make TaskHub an API. Let other developers build on it.

---

## The Vision

TaskHub isn't trying to do everything.

It's solving one problem: **how do you capture tasks without friction and get them on your calendar so you actually finish them?**

Everything else serves that goal.

---

## Thank You

Thanks to Google for the Chrome AI Hackathon.

Thanks to Devpost for hosting it.

Thanks to everyone who tested TaskHub and gave feedback.

We're excited to keep building.

---

## Quick Summary

**The Problem:**
Tasks are everywhere. You don't finish them.

**The Science:**
Tasks on calendars get done.

**The Solution:**
TaskHub: capture easy, calendar automatic, you finish more.

**The Difference:**
- Simple (one click)
- Private (your data, your computer)
- Smart (real AI)
- Calendar-first (science-backed)

**Try it:**
Install TaskHub. Start capturing. See what happens.

You'll finish more. We promise.
