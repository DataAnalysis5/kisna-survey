import fs from "fs"
import PDFDocument from "pdfkit"
import csv from "csv-parser"
import path from "path"

class ReportGenerator {
  constructor(csvPath) {
    this.csvPath = csvPath
    this.data = []
    this.d3 = null
  }

  async readCSV() {
    if (!fs.existsSync(this.csvPath)) {
      throw new Error(`CSV file not found at path: ${this.csvPath}`)
    }

    return new Promise((resolve, reject) => {
      const results = []
      fs.createReadStream(this.csvPath)
        .pipe(csv())
        .on("data", (data) => results.push(data))
        .on("end", () => {
          if (results.length === 0) {
            reject(new Error("CSV file is empty"))
          } else {
            resolve(results)
          }
        })
        .on("error", (error) => reject(error))
    })
  }

  async initialize() {
    try {
      this.d3 = await import("d3-array")
    } catch (error) {
      console.error("Error loading d3-array:", error)
      throw error
    }
  }

  async generateAnalysis() {
    try {
      const responses = await this.readCSV()

      const surveyGroups = {}
      responses.forEach((response) => {
        const surveyTitle = response["Survey Title"] || "Unknown Survey"
        if (!surveyGroups[surveyTitle]) {
          surveyGroups[surveyTitle] = []
        }
        surveyGroups[surveyTitle].push(response)
      })

      const analysis = {
        overview: {
          totalSurveys: Object.keys(surveyGroups).length,
          totalResponses: responses.length,
          totalDepartments: [...new Set(responses.map((r) => r["Department"]))].length,
        },
        surveyAnalysis: {},
        departmentSummary: {},
      }

      Object.entries(surveyGroups).forEach(([surveyTitle, surveyResponses]) => {
        analysis.surveyAnalysis[surveyTitle] = this.analyzeSurvey(surveyTitle, surveyResponses)
      })

      const departments = [...new Set(responses.map((r) => r["Department"]))]
      departments.forEach((dept) => {
        const deptResponses = responses.filter((r) => r["Department"] === dept)
        analysis.departmentSummary[dept] = this.calculateSatisfactionMetrics(deptResponses)
      })

      analysis.overview.overallSatisfaction = this.calculateSatisfactionMetrics(responses)

      return analysis
    } catch (error) {
      console.error("Analysis generation error:", error)
      throw error
    }
  }

  analyzeSurvey(surveyTitle, responses) {
    if (!responses || responses.length === 0) {
      return {
        title: surveyTitle,
        totalResponses: 0,
        questions: {},
        satisfaction: { satisfactionRate: 0, dissatisfactionRate: 0, neutralRate: 0 },
        departmentBreakdown: {},
      }
    }

    const sampleResponse = responses[0]
    const questions = {}

    Object.keys(sampleResponse).forEach((key) => {
      if (key.startsWith("Question ")) {
        const questionNum = key.split(" ")[1]
        const questionText = sampleResponse[key]
        const answerKey = `Answer ${questionNum}`

        if (questionText && questionText.trim()) {
          questions[questionNum] = {
            text: questionText,
            responses: {},
            totalResponses: 0,
            type: null,
          }
        }
      }
    })

    Object.keys(questions).forEach((questionNum) => {
      const answerKey = `Answer ${questionNum}`
      const allAnswers = []

      responses.forEach((response) => {
        const answer = response[answerKey]
        if (answer && answer !== "No answer") {
          allAnswers.push(answer)
          questions[questionNum].totalResponses++

          if (questions[questionNum].responses[answer]) {
            questions[questionNum].responses[answer]++
          } else {
            questions[questionNum].responses[answer] = 1
          }
        }
      })

      questions[questionNum].type = this.determineQuestionType(allAnswers[0], allAnswers)

      if (questions[questionNum].type === "Checkbox") {
        questions[questionNum] = this.processCheckboxQuestion(questions[questionNum], responses, answerKey)
      }
    })

    const surveyDepartments = [...new Set(responses.map((r) => r["Department"]))]
    const departmentBreakdown = {}

    surveyDepartments.forEach((dept) => {
      const deptResponses = responses.filter((r) => r["Department"] === dept)
      departmentBreakdown[dept] = {
        responseCount: deptResponses.length,
        satisfaction: this.calculateSatisfactionMetrics(deptResponses),
      }
    })

    return {
      title: surveyTitle,
      totalResponses: responses.length,
      questions: questions,
      satisfaction: this.calculateSatisfactionMetrics(responses),
      departmentBreakdown: departmentBreakdown,
    }
  }

  processCheckboxQuestion(questionData, responses, answerKey) {
    const processedQuestion = { ...questionData }
    processedQuestion.responses = {}
    processedQuestion.totalResponses = 0

    responses.forEach((response) => {
      const answer = response[answerKey]
      if (answer && answer !== "No answer") {
        processedQuestion.totalResponses++

        const selections = answer.split(",").map((s) => s.trim())
        selections.forEach((selection) => {
          if (selection) {
            processedQuestion.responses[selection] = (processedQuestion.responses[selection] || 0) + 1
          }
        })
      }
    })

    return processedQuestion
  }

  calculateSatisfactionMetrics(responses) {
    let totalSatisfactionQuestions = 0
    let satisfiedCount = 0
    let dissatisfiedCount = 0
    let neutralCount = 0

    responses.forEach((response) => {
      Object.keys(response).forEach((key) => {
        if (key.startsWith("Answer")) {
          const answer = response[key]
          if (!answer || answer === "No answer") return

          const satisfactionCategory = this.categorizeSatisfactionResponse(answer)
          if (satisfactionCategory.category !== "other") {
            totalSatisfactionQuestions++
            if (satisfactionCategory.category === "satisfied") {
              satisfiedCount++
            } else if (satisfactionCategory.category === "dissatisfied") {
              dissatisfiedCount++
            } else if (satisfactionCategory.category === "neutral") {
              neutralCount++
            }
          }
        }
      })
    })

    const satisfactionRate =
      totalSatisfactionQuestions > 0 ? Math.round((satisfiedCount / totalSatisfactionQuestions) * 100) : 0
    const dissatisfactionRate =
      totalSatisfactionQuestions > 0 ? Math.round((dissatisfiedCount / totalSatisfactionQuestions) * 100) : 0
    const neutralRate =
      totalSatisfactionQuestions > 0 ? Math.round((neutralCount / totalSatisfactionQuestions) * 100) : 0

    return {
      satisfactionRate,
      dissatisfactionRate,
      neutralRate,
      totalEvaluableResponses: totalSatisfactionQuestions,
      satisfiedCount,
      dissatisfiedCount,
      neutralCount,
    }
  }

  categorizeSatisfactionResponse(answer) {
    const answerLower = answer.toString().toLowerCase().trim()

    const starMatch = answerLower.match(/(\d+)\s*stars?/) || answerLower.match(/^(\d+)$/)
    if (starMatch) {
      const rating = Number.parseInt(starMatch[1])
      if (rating >= 1 && rating <= 5) {
        if (rating >= 4) return { category: "satisfied", score: rating }
        if (rating <= 2) return { category: "dissatisfied", score: rating }
        return { category: "neutral", score: rating }
      }
    }

    const satisfiedTerms = [
      "very satisfied",
      "satisfied",
      "excellent",
      "very good",
      "good",
      "strongly agree",
      "agree",
      "always",
      "often",
      "yes",
      "continue",
    ]
    const dissatisfiedTerms = [
      "very dissatisfied",
      "dissatisfied",
      "poor",
      "very poor",
      "bad",
      "strongly disagree",
      "disagree",
      "never",
      "rarely",
      "no",
      "discontinue",
    ]
    const neutralTerms = ["neutral", "average", "okay", "sometimes", "maybe", "modify"]

    for (const term of satisfiedTerms) {
      if (answerLower.includes(term)) {
        return { category: "satisfied", term }
      }
    }

    for (const term of dissatisfiedTerms) {
      if (answerLower.includes(term)) {
        return { category: "dissatisfied", term }
      }
    }

    for (const term of neutralTerms) {
      if (answerLower.includes(term)) {
        return { category: "neutral", term }
      }
    }

    return { category: "other" }
  }

  async generatePDF(analysis) {
    try {
      if (!analysis) {
        analysis = await this.generateAnalysis()
      }

      const doc = new PDFDocument({
        autoFirstPage: true,
        size: "A4",
        margin: 50,
        info: {
          Title: "Survey Analysis Report",
          Author: "Survey Analysis System",
          Subject: "Individual Survey Analysis",
          Keywords: "survey, analysis, satisfaction, responses",
        },
      })

      const outputPath = path.join(path.dirname(this.csvPath), "..", "reports", "survey_analysis.pdf")

      const reportsDir = path.dirname(outputPath)
      if (!fs.existsSync(reportsDir)) {
        fs.mkdirSync(reportsDir, { recursive: true })
      }

      const stream = fs.createWriteStream(outputPath)
      doc.pipe(stream)

      this.createCoverPage(doc, analysis)
      doc.addPage()

      this.createOverallSummary(doc, analysis)
      doc.addPage()

      this.createDepartmentSummary(doc, analysis)
      doc.addPage()

      Object.entries(analysis.surveyAnalysis).forEach(([surveyTitle, surveyData]) => {
        this.createSurveyAnalysisPage(doc, surveyData)
        doc.addPage()
      })

      doc.end()

      return new Promise((resolve, reject) => {
        stream.on("finish", () => resolve(outputPath))
        stream.on("error", reject)
      })
    } catch (error) {
      console.error("PDF Generation Error:", error)
      throw new Error(`Failed to generate PDF: ${error.message}`)
    }
  }

  createCoverPage(doc, analysis) {
    doc.fontSize(28).fillColor("#253074").text("Survey Analysis Report", { align: "center" })
    doc.moveDown(2)

    const boxY = doc.y
    doc.rect(75, boxY, doc.page.width - 150, 180).fillAndStroke("#f8f9fa", "#253074")

    doc
      .fontSize(16)
      .fillColor("#253074")
      .text("Executive Summary", 100, boxY + 20)
    doc
      .fontSize(12)
      .fillColor("#333333")
      .text(`Total Surveys Analyzed: ${analysis.overview.totalSurveys}`, 100, boxY + 50)
      .text(`Total Responses: ${analysis.overview.totalResponses}`, 100, boxY + 70)
      .text(`Departments Covered: ${analysis.overview.totalDepartments}`, 100, boxY + 90)
      .text(`Overall Satisfaction: ${analysis.overview.overallSatisfaction.satisfactionRate}%`, 100, boxY + 110)
      .text(`Overall Dissatisfaction: ${analysis.overview.overallSatisfaction.dissatisfactionRate}%`, 100, boxY + 130)
      .text(`Generated: ${new Date().toLocaleDateString()}`, 100, boxY + 150)

    doc.y = boxY + 200
  }

  createOverallSummary(doc, analysis) {
    doc.fontSize(20).fillColor("#253074").text("Overall Satisfaction Summary", { align: "center" })
    doc.moveDown(2)

    const overall = analysis.overview.overallSatisfaction

    doc.fontSize(14).fillColor("#253074").text("Key Metrics:")
    doc
      .fontSize(11)
      .fillColor("#333333")
      .text(`Satisfaction Rate: ${overall.satisfactionRate}%`)
      .text(`Dissatisfaction Rate: ${overall.dissatisfactionRate}%`)
      .text(`Neutral Rate: ${overall.neutralRate}%`)
      .text(`Total Evaluable Responses: ${overall.totalEvaluableResponses}`)

    doc.moveDown(3)

    doc.fontSize(16).fillColor("#253074").text("Survey Breakdown:")
    doc.moveDown(1)

    Object.entries(analysis.surveyAnalysis).forEach(([title, data]) => {
      doc.fontSize(12).fillColor("#253074").text(`${title}:`)
      doc
        .fontSize(10)
        .fillColor("#333333")
        .text(`  Responses: ${data.totalResponses}`)
        .text(`  Satisfaction: ${data.satisfaction.satisfactionRate}%`)
        .text(`  Questions: ${Object.keys(data.questions).length}`)
      doc.moveDown(0.5)
    })
  }

  createDepartmentSummary(doc, analysis) {
    doc.fontSize(20).fillColor("#253074").text("Department-wise Analysis", { align: "center" })
    doc.moveDown(2)

    Object.entries(analysis.departmentSummary).forEach(([dept, deptData]) => {
      doc.fontSize(14).fillColor("#253074").text(`${dept} Department`)
      doc.moveDown(0.5)

      doc
        .fontSize(10)
        .fillColor("#333333")
        .text(`Satisfaction: ${deptData.satisfactionRate}% (${deptData.satisfiedCount})`)
        .text(`Dissatisfaction: ${deptData.dissatisfactionRate}% (${deptData.dissatisfiedCount})`)
        .text(`Neutral: ${deptData.neutralRate}% (${deptData.neutralCount})`)

      doc.moveDown(2)

      if (doc.y > 650) {
        doc.addPage()
      }
    })
  }

  createSurveyAnalysisPage(doc, surveyData) {
    doc.fontSize(18).fillColor("#253074").text(`Survey: ${surveyData.title}`, { align: "center" })
    doc.moveDown(1)

    doc
      .fontSize(12)
      .fillColor("#333333")
      .text(`Total Responses: ${surveyData.totalResponses}`)
      .text(`Satisfaction Rate: ${surveyData.satisfaction.satisfactionRate}%`)
      .text(`Questions Analyzed: ${Object.keys(surveyData.questions).length}`)
    doc.moveDown(1)

    doc.fontSize(14).fillColor("#253074").text("Department Breakdown:")
    Object.entries(surveyData.departmentBreakdown).forEach(([dept, deptData]) => {
      doc
        .fontSize(10)
        .fillColor("#333333")
        .text(`${dept}: ${deptData.responseCount} responses (${deptData.satisfaction.satisfactionRate}% satisfied)`)
    })
    doc.moveDown(1)

    doc.fontSize(14).fillColor("#253074").text("Question Analysis:")
    doc.moveDown(0.5)

    Object.entries(surveyData.questions).forEach(([qNum, questionData]) => {
      doc.fontSize(11).fillColor("#253074").text(`Q${qNum}: ${questionData.text}`)
      doc
        .fontSize(9)
        .fillColor("#666666")
        .text(`Type: ${questionData.type} | Responses: ${questionData.totalResponses}`)

      if (questionData.type === "StarRating") {
        this.renderStarRatingBreakdown(doc, questionData.responses)
      } else if (questionData.type === "MCQ") {
        this.renderMCQBreakdown(doc, questionData.responses, questionData.totalResponses)
      } else if (questionData.type === "Checkbox") {
        this.renderCheckboxBreakdown(doc, questionData.responses)
      } else {
        this.renderTextBreakdown(doc, questionData.responses, questionData.totalResponses)
      }

      doc.moveDown(1)

      if (doc.y > 650) {
        doc.addPage()
      }
    })
  }

  renderStarRatingBreakdown(doc, responses) {
    const stars = ["1", "2", "3", "4", "5"]
    stars.forEach((star) => {
      const count = responses[`${star} stars`] || responses[star] || 0
      doc
        .fontSize(9)
        .fillColor("#333333")
        .text(`  ${star} Star${star > 1 ? "s" : ""}: ${count}`, { indent: 20 })
    })
  }

  renderMCQBreakdown(doc, responses, total) {
    Object.entries(responses)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .forEach(([option, count]) => {
        const percentage = Math.round((count / total) * 100)
        const displayOption = option.length > 30 ? option.substring(0, 30) + "..." : option
        doc.fontSize(9).fillColor("#333333").text(`  ${displayOption}: ${count} (${percentage}%)`, { indent: 20 })
      })
  }

  renderCheckboxBreakdown(doc, responses) {
    Object.entries(responses)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .forEach(([option, count]) => {
        const displayOption = option.length > 30 ? option.substring(0, 30) + "..." : option
        doc.fontSize(9).fillColor("#333333").text(`  ${displayOption}: ${count} selections`, { indent: 20 })
      })
  }

  renderTextBreakdown(doc, responses, total) {
    doc.fontSize(9).fillColor("#333333").text(`  Total text responses: ${total}`, { indent: 20 })
    const samples = Object.keys(responses).slice(0, 2)
    samples.forEach((response, index) => {
      const truncated = response.length > 40 ? response.substring(0, 40) + "..." : response
      doc.text(`  Sample ${index + 1}: "${truncated}"`, { indent: 20 })
    })
  }

  determineQuestionType(answer, allAnswers = []) {
    if (!answer) return "Text"

    if (/^[1-5]$/.test(answer.toString().trim()) || answer.match(/(\d+)\s*stars?/i)) {
      return "StarRating"
    }

    if (answer.includes(",")) {
      return "Checkbox"
    }

    const mcqOptions = [
      "Very Satisfied",
      "Satisfied",
      "Neutral",
      "Dissatisfied",
      "Very Dissatisfied",
      "Excellent",
      "Good",
      "Average",
      "Poor",
      "Very Poor",
      "Strongly Agree",
      "Agree",
      "Disagree",
      "Strongly Disagree",
      "Always",
      "Often",
      "Sometimes",
      "Rarely",
      "Never",
      "Yes",
      "No",
      "Maybe",
      "Continue",
      "Discontinue",
      "Modify",
    ]

    if (mcqOptions.includes(answer.toString().trim())) {
      return "MCQ"
    }

    return "Text"
  }

  async analyze() {
    return await this.generateAnalysis()
  }

  calculateSatisfactionRate(responses) {
    const overall = this.calculateSatisfactionMetrics(responses)
    return overall.satisfactionRate
  }
}

export default ReportGenerator
