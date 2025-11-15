import mongoose from "mongoose"

const responseSchema = new mongoose.Schema({
  surveyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Survey",
    required: [true, "Survey ID is required"],
  },
  userId: {
    type: String,
    required: [true, "User ID is required"],
    trim: true,
  },
  employeeCode: {
    type: String,
    trim: true,
    default: "NA",
  },
  name: {
    type: String,
    default: "NA",
    trim: true,
  },
  department: {
    type: String,
    required: [true, "Department is required"],
    trim: true,
  },
  designation: {
    type: String,
    required: [true, "Designation is required"],
    trim: true,
  },
  location: {
    type: String,
    required: [true, "Location is required"],
    trim: true,
  },
  basedAt: {
    type: String,
    trim: true,
    default: "NA",
  },
  mobileNo: {
    type: String,
    trim: true,
    default: "NA",
  },
  answers: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    required: [true, "Answers are required"],
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
  pdfGenerated: {
    type: Boolean,
    default: false,
  },
  pdfPath: {
    type: String,
    default: null,
  },
})

responseSchema.index({ surveyId: 1 })
responseSchema.index({ userId: 1 })
responseSchema.index({ department: 1 })
responseSchema.index({ location: 1 })

responseSchema.pre("save", async function () {
  try {
    const indexes = await this.collection.getIndexes()
    const uniqueIndexName = "surveyId_1_department_1_tenure_1"

    if (indexes[uniqueIndexName]) {
      await this.collection.dropIndex(uniqueIndexName)
      console.log(`Dropped unique index: ${uniqueIndexName}`)
    }
  } catch (error) {
    console.error("Error handling indexes:", error)
  }
})

export default mongoose.model("Response", responseSchema)
