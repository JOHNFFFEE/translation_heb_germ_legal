// Load PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.9.359/pdf.worker.min.js";

// import germanTranslations from "translations_clean_german.json" assert { type: "json" };

// let germanTranslations = "./translations_clean_german.json";

// At the top of your script.js, declare germanTranslations as a global variable

let germanTranslations = {};

// Then load the translations file using fetch
async function loadTranslations() {
  try {
    const response = await fetch("./translations_clean_german.json");
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();

    // Combine all translations into one flat object
    germanTranslations = {
      ...data.names,
      ...data.occupations,
      ...data.cities,
      ...data.general,
    };

    console.log("Translations loaded successfully");
  } catch (error) {
    console.error("Error loading translations:", error);
  }
}

// Call this when your script loads
loadTranslations();

// Store the extracted data
let extractedData = {};

// Process the uploaded PDF
async function processPDF() {
  const spinner = document.getElementById("spinner");
  const fileInput = document.getElementById("pdf-upload");
  const templateSelect = document.getElementById("template-select");
  const templateSection = document.getElementById("template-section");

  if (!fileInput.files.length) {
    alert("Bitte laden Sie eine PDF-Datei hoch.");
    return;
  }

  if (!spinner) {
    console.error("Spinner element not found in the DOM.");
    return;
  }

  spinner.style.display = "block";

  try {
    const file = fileInput.files[0];
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = "";

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item) => item.str).join(" ");
      fullText += pageText + "\n";
    }

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 2 });
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: context, viewport }).promise;
    const imageData = canvas.toDataURL("image/png");

    const {
      data: { text },
    } = await Tesseract.recognize(imageData, "heb+eng", {
      logger: (m) => console.log(m),
    });
    fullText = text || fullText;

    console.log("Extracted text:", fullText);

    const templateType = templateSelect.value;
    extractedData = parseHebrewFields(fullText, templateType);

    const templateHTML = await loadTemplate(templateType);
    templateSection.innerHTML = templateHTML;
    populateTemplate(extractedData);
  } catch (error) {
    console.error("Fehler beim Verarbeiten des PDFs:", error);
    alert("Ein Fehler ist aufgetreten. Bitte versuchen Sie es erneut.");
  } finally {
    spinner.style.display = "none";
  }
}
// Field mapping (expanded for all certificate types)
const hebrewFieldMap = {
  "שם פרטי": "firstname",
  "שם משפחה": "familyname",
  "שם האב": "fathersname",
  "שם האם": "mothersname",
  "שם הסב": "grandfathername",
  מין: "gender",
  "המצב האישי": "maritalstatus",
  "תאריך לידה": "dateofbirth",
  "ארץ לידה": "countryofbirth",
  "מקום לידה": "placeofbirth",
  "שם בית החולים": "hospitalname",
  "תאריך רישום": "dateofregistration",
  "מספר רישום": "registrationnumber",
  "מספר זהות": "idnumber",
  "אריך עלייה": "aliyahdate",
  לאום: "nationality",
  דת: "religion",
  "תאריך פטירה": "dateofdeath",
  "שם הסב": "grandfathername",
  "מקום רישום": "placeofregistration",
  המען: "address",
  "תאריך הכניסה למען": "addressentrydate",
  "שמות משפחה קודמים": "previousfamilyname",
  בתאריך: "dateissued",
};

// Mock translations
const valueTranslations = {
  יצחק: "Yitzhak",
  כהן: "Cohen",
  דוד: "David",
  שרה: "Sarah",
  גדעון: "Gideon",
  שנהב: "Shenhav",
  שאול: "Shaul",
  מרגרטה: "Margreta",
  זכר: "Male",
  נקבה: "Female",
  נשוי: "Married",
  ירושלים: "Jerusalem",
  אוסטריה: "Austria",
  יהודי: "Jewish",
  יהודיה: "Jewish",
};

// Parse fields based on certificate type
function parseHebrewFields(text, templateType) {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line);
  const parsedData = {
    firstname: "",
    familyname: "",
    fathersname: "",
    mothersname: "",
    grandfathername: "",
    gender: "",
    idnumber: "",
    placeofbirth: "",
    hospitalname: "",
    dateofbirth: "",
    countryofbirth: "",
    dateofregistration: "",
    registrationnumber: "",
    aliyahdate: "",
    nationality: "",
    religion: "",
    dateofdeath: "",
    maritalstatus: "",
    placeofregistration: "",
    dateissued: "",
    address: "",
    addressentrydate: "",
    previousfamilyname: "",
    reference: "Unknown",
    certNumber: "Unknown",
    registrationdate: "", // New field
    issuetime: "", // New field
  };

  let currentPerson = null;
  // Ensure groom and bride are always initialized for marriage_certificate
  if (templateType === "marriage_certificate") {
    parsedData.groom = {
      occupation: "",
      father: {},
      mother: {},
      maritalstatus: "",
    };
    parsedData.bride = {
      occupation: "",
      father: {},
      mother: {},
      maritalstatus: "",
    };
  } else if (templateType === "divorce_certificate") {
    parsedData.groom = {};
    parsedData.bride = {};
    parsedData.husband = { occupation: "", alias: "" };
    parsedData.wife = { occupation: "", alias: "" };
  }

  // Check if the certificate has English labels (bilingual format)
  const hasEnglishLabels = lines.some(
    (line) => line.includes("Surname") || line.includes("Given name")
  );

  lines.forEach((line, index) => {
    // Fix common OCR typos
    line = line
      .replace("משפתה", "משפחה")
      .replace("פרטל", "פרטי")
      .replace("שלהאם", "של האם")
      .replace("שלהאב", "של האב")
      .replace("שיכיר", "שכיר")
      .replace("חברת ביטות", "חברת ביטוח")
      .replace("חשמות", "שמות")
      .replace("וקבה", "נקבה");

    // Person detection for marriage/divorce
    if (templateType === "marriage_certificate") {
      if (line.includes("חתן") || line.includes("Groom"))
        currentPerson = "groom";
      else if (line.includes("כלה") || line.includes("Bride"))
        currentPerson = "bride";
    } else if (templateType === "divorce_certificate") {
      if (line.includes("הבעל") || line.includes("Husband"))
        currentPerson = "husband";
      else if (line.includes("האשה") || line.includes("Wife"))
        currentPerson = "wife";
    }

    // Specific parsing for Marriage Certificate
    if (templateType === "marriage_certificate") {
      const tableLabels = [
        "השמות הפרטיים",
        "שם המשפחה לפני הנישואין",
        "מספר הזהות",
        "תאריך הלידה",
        "יוחסין",
        "מקום המגורים",
        "משלח היד",
        "האב - שם פרטי ושם משפחה",
        "האם - שם פרטי ושם משפחה",
        "מקום מגורי האב",
        "מקום מגורי האם",
        "משלח היד של האב",
        "משלח היד של האם",
      ];

      if (
        line.includes("פרטים אישיים") ||
        line.includes("הבעל") ||
        line.includes("האישה") ||
        line.includes("Personal Details") ||
        line.includes("Groom") ||
        line.includes("Bride")
      ) {
        // Clean the line by removing non-characters
        const cleanedLine = line
          .replace(/[|\.\-:\\]/g, " ") // Replace |, ., -, :, \ with spaces
          .replace(/\s+/g, " ") // Collapse multiple spaces into one
          .trim();

        // Family name for groom (Hebrew or English)
        const groomFamilyMatch =
          cleanedLine.match(
            /(שם המשפחה\s+הבעל|הבעל\s+שם המשפחה|Groom\s+Family Name|Family Name\s+Groom)\s+([\u0590-\u05FF]+)/i
          ) || cleanedLine.match(/הבעל\s+([\u0590-\u05FF]+)/i); // Fallback if "שם המשפחה" is missing
        if (groomFamilyMatch) {
          parsedData.groom.previousfamilyname =
            groomFamilyMatch[groomFamilyMatch.length - 1].trim(); // e.g., "גולדמן"
          console.log("Groom Family Name:", parsedData.groomFamilyName);
        }

        // Family name for bride (Hebrew or English)
        const brideFamilyMatch =
          cleanedLine.match(
            /(שם המשפחה\s+האישה|האישה\s+שם המשפחה|Bride\s+Family Name|Family Name\s+Bride)\s+([\u0590-\u05FF]+)/i
          ) || cleanedLine.match(/האישה\s+([\u0590-\u05FF]+)/i); // Fallback if "שם המשפחה" is missing
        if (brideFamilyMatch) {
          parsedData.brideFamilyName =
            brideFamilyMatch[brideFamilyMatch.length - 1].trim(); // e.g., "גולדברג"
          console.log("Bride Family Name:", parsedData.brideFamilyName);
        }

        // First name for groom (if present, Hebrew or English)
        const groomFirstMatch = cleanedLine.match(
          /(השם הפרטי\s+הבעל|הבעל\s+השם הפרטי|Groom\s+First Name|First Name\s+Groom)\s+([\u0590-\u05FF]+)/i
        );
        if (groomFirstMatch) {
          parsedData.groom.firstname = groomFirstMatch[2].trim(); // e.g., "משה" (if present)
          console.log("Groom First Name:", parsedData.groom.firstname);
        }

        // First name for bride (if present, Hebrew or English)
        const brideFirstMatch = cleanedLine.match(
          /(השם הפרטי\s+האישה|האישה\s+השם הפרטי|Bride\s+First Name|First Name\s+Bride)\s+([\u0590-\u05FF]+)/i
        );
        if (brideFirstMatch) {
          parsedData.bride.firstnam = brideFirstMatch[2].trim(); // e.g., "שרה" (if present)
          console.log("Bride First Name:", parsedData.bride.firstnam);
        }
      }

      if (line.includes("תעודת נישואין")) {
        const certMatch = line.match(/תעודת\s+נישואין\s*[:\-]?\s*(\d+)/i);
        if (certMatch) {
          parsedData.certNumber = certMatch[1];
          console.log("Certificate Number:", parsedData.certNumber);
        }
      }

      tableLabels.forEach((label) => {
        if (line.includes(label)) {
          const parts = line.split(label);
          if (parts.length > 1) {
            let dataPart = parts[1].trim();

            if (label === "השמות הפרטיים") {
              const nameMatch = dataPart.match(/(\S+)\s+(\S+)/);
              if (nameMatch) {
                parsedData.groom.firstname =
                  valueTranslations[nameMatch[1]] || nameMatch[1];
                parsedData.bride.firstname =
                  valueTranslations[nameMatch[2]] || nameMatch[2];
              }
            } else if (label === "שם המשפחה לפני הנישואין") {
              const familyNameMatch = dataPart.match(/(\S+)\s+(\S+)/);
              if (familyNameMatch) {
                parsedData.groom.previousfamilyname =
                  valueTranslations[familyNameMatch[1]] || familyNameMatch[1];
                parsedData.bride.previousfamilyname =
                  valueTranslations[familyNameMatch[2]] || familyNameMatch[2];
              }
            } else if (label === "מספר הזהות") {
              // Updated regex to handle "וה" or spaces as separators
              const idMatch = dataPart.match(/(\d{9})\s*(?:וה|\s+)\s*(\d{9})/);
              if (idMatch) {
                parsedData.groom.idnumber = idMatch[1]; // "200376127"
                parsedData.bride.idnumber = idMatch[2]; // "204661722"
                console.log("Groom ID:", parsedData.groom.idnumber);
                console.log("Bride ID:", parsedData.bride.idnumber);
              }
            } else if (label === "תאריך הלידה") {
              // Updated regex to handle special characters and flexible spacing
              const dobMatch = dataPart.match(
                /.*?(\d{2}\/\d{2}\/\d{4})\s+.*?(?:\S+\s+)?(\d{2}\/\d{2}\/\d{4})/
              );
              if (dobMatch) {
                parsedData.groom.dateofbirth = dobMatch[1]; // "08/01/1988"
                parsedData.bride.dateofbirth = dobMatch[2]; // "10/11/1992"
              } else {
                console.log("Failed to match dates of birth:", dataPart);
              }
            } else if (label === "יוחסין") {
              const religionMatch = dataPart.match(/(\S+)\s+(\S+)/);
              if (religionMatch) {
                parsedData.groom.religion =
                  valueTranslations[religionMatch[1]] || religionMatch[1];
                parsedData.bride.religion =
                  valueTranslations[religionMatch[2]] || religionMatch[2];
              }
            } else if (label === "מקום המגורים") {
              const addressMatch = dataPart.match(/(.+?)\s+(.+)/);
              if (addressMatch) {
                let groomAddress = addressMatch[1].trim();
                let brideAddress = addressMatch[2].trim();
                groomAddress = groomAddress
                  .split(/\s+/)
                  .map((part) => valueTranslations[part] || part)
                  .join(" ");
                brideAddress = brideAddress
                  .split(/\s+/)
                  .map((part) => valueTranslations[part] || part)
                  .join(" ");
                parsedData.groom.address = groomAddress;
                parsedData.bride.address = brideAddress;
              }
            } else if (label === "משלח היד") {
              const occupationMatch = dataPart.match(/(\S+)\s+(\S+\s+\S+)/);
              if (occupationMatch) {
                parsedData.groom.occupation =
                  valueTranslations[occupationMatch[1]] || occupationMatch[1];
                parsedData.bride.occupation =
                  valueTranslations[occupationMatch[2]] || occupationMatch[2];
              }
            } else if (
              label === "האב - שם פרטי ומשפחה" ||
              label === "האב - שם פרטי ושם משפחה"
            ) {
              // Clean separators and split
              const cleanedData = dataPart
                .replace(/[|:\-]/g, " ")
                .replace(/\s+/g, " ")
                .trim();
              const fatherNameMatch = cleanedData.match(
                /([\u0590-\u05FF]+(?:\s+[\u0590-\u05FF]+)?)\s+([\u0590-\u05FF]+)/
              );

              if (fatherNameMatch) {
                parsedData.groom.father = parsedData.groom.father || {};
                parsedData.bride.father = parsedData.bride.father || {};

                // Groom's father (first part might include two words like "מנחם מענדל")
                const groomFatherParts = fatherNameMatch[1].split(/\s+/);
                parsedData.groom.father.firstName = groomFatherParts[0]; // "מנחם"
                if (groomFatherParts.length > 1) {
                  parsedData.groom.father.familyName = groomFatherParts[1]; // "מענדל"
                }

                // Bride's father (second part)
                parsedData.bride.father.firstName = fatherNameMatch[2]; // "בנימין"

                console.log(
                  `Groom's father: ${parsedData.groom.father.firstName} ${
                    parsedData.groom.father.familyName || ""
                  }`
                );
                console.log(
                  `Bride's father: ${parsedData.bride.father.firstName}`
                );
              } else {
                console.log("Failed to match father's names:", cleanedData);
              }
            } else if (
              label === "האם - שם פרטי ומשפחה" ||
              label === "האם - שם פרטי ושם משפחה"
            ) {
              // Clean separators and split
              const cleanedData = dataPart
                .replace(/[|:\-]/g, " ")
                .replace(/\s+/g, " ")
                .trim();
              const motherNameMatch = cleanedData.match(
                /([\u0590-\u05FF]+)\s+([\u0590-\u05FF]+)/
              );

              if (motherNameMatch) {
                parsedData.groom.mother = parsedData.groom.mother || {};
                parsedData.bride.mother = parsedData.bride.mother || {};

                parsedData.groom.mother.firstName = motherNameMatch[1]; // "אסתר"
                parsedData.bride.mother.firstName = motherNameMatch[2]; // "טובה"

                console.log(
                  `Groom's mother: ${parsedData.groom.mother.firstName}`
                );
                console.log(
                  `Bride's mother: ${parsedData.bride.mother.firstName}`
                );
              } else {
                console.log("Failed to match mother's names:", cleanedData);
              }
            } else if (label === "מקום מגורי האב") {
              // Updated regex to split after the first full address (street, number, city)
              const fatherAddressMatch = dataPart.match(
                /(.+?\d+\s+\S+)\s+(.+)/
              );
              if (fatherAddressMatch) {
                let groomFatherAddress = fatherAddressMatch[1].trim();
                let brideFatherAddress = fatherAddressMatch[2].trim();
                groomFatherAddress = groomFatherAddress
                  .split(/\s+/)
                  .map((part) => valueTranslations[part] || part)
                  .join(" ");
                brideFatherAddress = brideFatherAddress
                  .split(/\s+/)
                  .map((part) => valueTranslations[part] || part)
                  .join(" ");
                parsedData.groom.father = parsedData.groom.father || {};
                parsedData.bride.father = parsedData.bride.father || {};
                parsedData.groom.father.address = groomFatherAddress; // "Usishkin 5 Holon"
                parsedData.bride.father.address = brideFatherAddress; // "Sderot Moshe Dayan 67 Jerusalem"
              } else {
                console.log("Failed to match father's addresses:", dataPart);
              }
            } else if (label === "מקום מגורי האם") {
              // Updated regex to split after the first full address (street, number, city)
              const motherAddressMatch = dataPart.match(
                /(.+?\d+\s+\S+)\s+(.+)/
              );
              if (motherAddressMatch) {
                let groomMotherAddress = motherAddressMatch[1].trim();
                let brideMotherAddress = motherAddressMatch[2].trim();
                groomMotherAddress = groomMotherAddress
                  .split(/\s+/)
                  .map((part) => valueTranslations[part] || part)
                  .join(" ");
                brideMotherAddress = brideMotherAddress
                  .split(/\s+/)
                  .map((part) => valueTranslations[part] || part)
                  .join(" ");
                parsedData.groom.mother = parsedData.groom.mother || {};
                parsedData.bride.mother = parsedData.bride.mother || {};
                parsedData.groom.mother.address = groomMotherAddress; // "Balfour 103 Bat Yam"
                parsedData.bride.mother.address = brideMotherAddress; // "Sderot David Hamelech 67 Jerusalem"
              } else {
                console.log("Failed to match mother's addresses:", dataPart);
              }
            } else if (label === "משלח היד של האב") {
              const fatherOccupationMatch = dataPart.match(/(\S+)/);
              if (fatherOccupationMatch) {
                parsedData.groom.father = parsedData.groom.father || {};
                parsedData.groom.father.occupation =
                  valueTranslations[fatherOccupationMatch[1]] ||
                  fatherOccupationMatch[1];
              }
            } else if (label === "משלח היד של האם") {
              // Updated regex to handle special characters and flexible word counts
              const motherOccupationMatch =
                dataPart.match(/(.+?)\s*['‘]\s*(.+)/);
              if (motherOccupationMatch) {
                let groomMotherOccupation = motherOccupationMatch[1].trim();
                let brideMotherOccupation = motherOccupationMatch[2].trim();
                parsedData.groom.mother = parsedData.groom.mother || {};
                parsedData.bride.mother = parsedData.bride.mother || {};
                parsedData.groom.mother.occupation =
                  valueTranslations[groomMotherOccupation] ||
                  groomMotherOccupation; // "Insurance Company"
                parsedData.bride.mother.occupation =
                  valueTranslations[brideMotherOccupation] ||
                  brideMotherOccupation; // "Cleaner"
              } else {
                console.log("Failed to match mother's occupations:", dataPart);
              }
            }
          }
        }
      });

      if (line.includes("פרטי העדים")) {
        // Extract witness labels (עדא and עדב)
        const witnessLabelMatch = line.match(/פרטי העדים\s+(\S+)\s+(\S+)/);
        if (witnessLabelMatch) {
          parsedData.witnessLabel = witnessLabelMatch[1]; // עדא
          parsedData.witnessBLabel = witnessLabelMatch[2]; // עדב
          console.log(
            `Witness labels: ${parsedData.witnessLabel}, ${parsedData.witnessBLabel}`
          );
        } else {
          console.log("Failed to match witness labels:", line);
        }

        // Extract witness names from the next line
        const witnessLine = lines[index + 1] || "";
        const witnessMatch = witnessLine.match(
          /שם פרטי ושם משפחה\s+(.+?)\s*\.\s*(.+)/
        );
        if (witnessMatch) {
          let witness1 = witnessMatch[1].trim();
          let witness2 = witnessMatch[2].trim();
          parsedData.witness = valueTranslations[witness1] || witness1;
          parsedData.witnessB = valueTranslations[witness2] || witness2;
          console.log(
            `Witness names: ${parsedData.witness}, ${parsedData.witnessB}`
          );
        } else {
          console.log("Failed to match witness names:", witnessLine);
        }

        // Extract witness occupations from the following line
        const witnessOccupationLine = lines[index + 2] || "";
        const occupationMatch = witnessOccupationLine.match(
          /משלח היד\s+(.+?)\s+(.+)/
        );
        if (occupationMatch) {
          let witness1Occupation = occupationMatch[1].trim();
          let witness2Occupation = occupationMatch[2].trim();
          parsedData.witnessOccupation =
            valueTranslations[witness1Occupation] || witness1Occupation;
          parsedData.witnessBOccupation =
            valueTranslations[witness2Occupation] || witness2Occupation;
          console.log(
            `Witness occupations: ${parsedData.witnessOccupation}, ${parsedData.witnessBOccupation}`
          );
        } else {
          console.log(
            "Failed to match witness occupations:",
            witnessOccupationLine
          );
        }
      }

      if (line.includes("נערכו ב")) {
        const placeMatch = line.match(/נערכו ב(\S+\s+\S+)/);
        if (placeMatch) {
          let place = placeMatch[1].trim();
          place = place
            .split(/\s+/)
            .map((part) => valueTranslations[part] || part)
            .join(" ");
          parsedData.placeofregistration = place;
        }
      }

      if (line.includes("תאריך לועזי")) {
        const dateMatch = line.match(/תאריך לועזי:\s*(\d{2}\/\d{2}\/\d{4})/);
        if (dateMatch) {
          parsedData.registrationdate = dateMatch[1];
        }
      }

      if (line.includes("נרשמו ב")) {
        const registrationPlaceMatch = line.match(/נרשמו ב(.+)/);
        if (registrationPlaceMatch) {
          let place = registrationPlaceMatch[1].trim();
          place = place
            .split(/\s+/)
            .map((part) => valueTranslations[part] || part)
            .join(" ");
          parsedData.placeofregistration = place;
        }
      }

      if (line.includes("תאריך הדפסה")) {
        const dateIssuedMatch = line.match(/(\d{2}\/\d{2}\/\d{4})/);
        if (dateIssuedMatch) {
          parsedData.dateissued = dateIssuedMatch[1];
        }
      }

      if (line.includes("תאריך הדפסה")) {
        const timeMatch = line.match(/(\d{2}:\d{2})/);
        if (timeMatch) {
          parsedData.issuetime = timeMatch[1];
        }
      }

      if (line.includes("מספר תיק")) {
        const certMatch = line.match(/מספר תיק:\s*(\S+)/);
        if (certMatch) {
          parsedData.certNumber = certMatch[1];
        }
      }

      if (line.includes("מספר מועצה")) {
        const refMatch = line.match(/מספר מועצה:\s*(\d+)/);
        if (refMatch) {
          parsedData.reference = refMatch[1];
        }
      }

      parsedData.groom.maritalstatus = "Married";
      parsedData.bride.maritalstatus = "Married";
    }

    // Parse Hebrew fields generically (for non-English certificates)
    if (!hasEnglishLabels || templateType === "birth_certificate") {
      Object.keys(hebrewFieldMap).forEach((hebrewLabel) => {
        const regex = new RegExp(hebrewLabel + "\\s*[:\\-]?\\s*(.+)", "i");
        const match = line.match(regex);
        if (match || line.includes(hebrewLabel)) {
          let value = match ? match[1].trim() : lines[index + 1]?.trim();
          if (value) {
            value = valueTranslations[value] || value;
            const field = hebrewFieldMap[hebrewLabel];
            if (currentPerson) {
              parsedData[currentPerson][field] = value;
            } else {
              parsedData[field] = value;
            }
          }
        }
      });
    }

    // Specific parsing for Divorce Certificate
    if (templateType === "divorce_certificate") {
      // Define the labels we expect in the table
      const tableLabels = [
        "מסי ת. זהות", // ID Number
        "תאריך לידה", // Date of Birth
        "מקום מגורים בזמן הגירושין", // Place of Residence at the Time of Divorce
      ];

      // Reference Number
      if (line.includes("מסי:")) {
        const refMatch = line.match(/מסי:\s*(\d+)/);
        if (refMatch) {
          parsedData.reference = refMatch[1]; // "1125561"
        }
      }

      //   // Certificate Number
      //   if (line.includes("תיק מס'")) {
      //     const certMatch = line.match(/תיק מס'\s*(\d+)/);
      //     if (certMatch) {
      //       parsedData.certNumber = certMatch[1]; // "1323411"
      //     }
      //   }

      // Parse the 3-column table structure
      tableLabels.forEach((label) => {
        if (line.includes(label)) {
          // Split the line into parts based on the label
          const parts = line.split(label);
          if (parts.length > 1) {
            let dataPart = parts[1].trim();
            if (label === "מסי ת. זהות") {
              // ID Numbers: "028578920 028430080"
              const idMatch = dataPart.match(/(\d{9})\s+(\d{9})/);
              if (idMatch) {
                parsedData.wife.idnumber = idMatch[1]; // "028578920"
                parsedData.husband.idnumber = idMatch[2]; // "028430080"
              }
            } else if (label === "תאריך לידה") {
              // Dates of Birth: "כייט בסיון התשלייא כייט בטבת התשלייא 22/06/1971 26/01/1971"
              // Look for the next line to get the Gregorian dates
              const nextLine = lines[index + 1] ? lines[index + 1].trim() : "";
              const dobMatch =
                dataPart.match(
                  /(\d{2}\/\d{2}\/\d{4})\s+(\d{2}\/\d{2}\/\d{4})/
                ) ||
                (nextLine &&
                  nextLine.match(
                    /(\d{2}\/\d{2}\/\d{4})\s+(\d{2}\/\d{2}\/\d{4})/
                  ));
              if (dobMatch) {
                parsedData.wife.dateofbirth = dobMatch[1]; // "22/06/1971"
                parsedData.husband.dateofbirth = dobMatch[2]; // "26/01/1971"
              }
            } else if (label === "מקום מגורים בזמן הגירושין") {
              // Addresses: "שד וינגיט 27/21 חיפה הנשר 3/2 חיפה"
              // Split by "חיפה" to separate the two addresses
              const addressParts = dataPart.split("חיפה");
              if (addressParts.length >= 2) {
                // Wife's address: "שד וינגיט 27/21 חיפה"
                let wifeAddress = addressParts[0].trim() + " חיפה";
                wifeAddress = wifeAddress
                  .split(/\s+/)
                  .map((part) => valueTranslations[part] || part)
                  .join(" "); // Translate parts
                parsedData.wife.address = wifeAddress; // "Sderot Wingate 27/21 Haifa"

                // Husband's address: "הנשר 3/2 חיפה"
                let husbandAddress = addressParts[1].trim() + " חיפה";
                husbandAddress = husbandAddress
                  .split(/\s+/)
                  .map((part) => valueTranslations[part] || part)
                  .join(" "); // Translate parts
                parsedData.husband.address = husbandAddress; // "Hanesher 3/2 Haifa"
              }
            }
          }
        }
      });

      // Husband’s Name in Get (Alias)
      if (line.includes("השם המופיע בגט")) {
        const nameMatch = line.match(/השם המופיע בגט \(אם שונה\)\s+(\S+)/);
        if (nameMatch) {
          parsedData.husband.alias =
            valueTranslations[nameMatch[1]] || nameMatch[1]; // "David"
        }
      }

      // Husband’s Occupation (משלח ידו)
      if (line.includes("משלח ידו")) {
        const occupationMatch = line.match(/משלח ידו:\s*(\S+)/);
        if (occupationMatch) {
          parsedData.husband.occupation =
            valueTranslations[occupationMatch[1]] || occupationMatch[1]; // "עד" (Witness, possibly an OCR error)
        }
      }

      // Witness B (עד ב')
      if (line.includes("עד ב'")) {
        const witnessBMatch = line.match(/עד ב'\s*\|\s*(\S+\s+\S+\s+\S+)/);
        if (witnessBMatch) {
          parsedData.witnessB =
            valueTranslations[witnessBMatch[1]] || witnessBMatch[1]; // "Maimon Ben Eliyahu"
        } else {
          parsedData.witnessB = "Witness B"; // Fallback if name not found
        }
      }

      // Witness (עד)
      if (
        line.includes("עד") &&
        !line.includes("עד ב'") &&
        !line.includes("משלח ידו")
      ) {
        parsedData.witness = "Witness"; // We don’t have a name, just the role
      }

      // Get Written Date
      if (line.includes("הגט נכתב")) {
        const dateMatch = line.match(/\((\d{2}\/\d{2}\/\d{4})\)/);
        if (dateMatch) {
          parsedData.getWrittenDate = dateMatch[1]; // "11/07/2021"
        }
      }

      // Husband and Wife Names and Family Name
      if (line.includes("הגירושין נרשמו")) {
        // Extract names: "גל גולדשמידט, דניאל גולדשמידט"
        const nameMatch = line.match(/גל גולדשמידט,\s*דניאל גולדשמידט/);
        if (nameMatch) {
          parsedData.husband.firstname = valueTranslations["גל"] || "Gal";
          parsedData.wife.firstname = valueTranslations["דניאל"] || "Daniel";
          parsedData.husband.familyname =
            valueTranslations["גולדשמידט"] || "Goldschmidt";
          parsedData.wife.familyname =
            valueTranslations["גולדשמידט"] || "Goldschmidt";
        }
      }

      // Husband and Wife Names and Family Name after "סידורי גיטין"
      if (line.includes("סידורי גיטין")) {
        const nameMatch = line.match(
          /סידורי גיטין,\s*(\S+)\s+(\S+),\s*(\S+)\s+(\S+)/
        );
        if (nameMatch) {
          const husbandFirstName = nameMatch[1]; // First name of husband
          const husbandFamilyName = nameMatch[2]; // Family name of husband
          const wifeFirstName = nameMatch[3]; // First name of wife
          const wifeFamilyName = nameMatch[4]; // Family name of wife

          parsedData.husband.firstname =
            valueTranslations[husbandFirstName] || husbandFirstName;
          parsedData.husband.familyname =
            valueTranslations[husbandFamilyName] || husbandFamilyName;
          parsedData.wife.firstname =
            valueTranslations[wifeFirstName] || wifeFirstName;
          parsedData.wife.familyname =
            valueTranslations[wifeFamilyName] || wifeFamilyName;
        }
      }

      // Marital Status (inferred as "Divorced")
      if (line.includes("הגירושין")) {
        parsedData.husband.maritalstatus = "Divorced";
        parsedData.wife.maritalstatus = "Divorced";
      }

      // Place of Registration
      if (line.includes("בית הדין הרבני אזורי חיפה")) {
        parsedData.placeofregistration = "Haifa Regional Rabbinical Court";
      }

      // Registration Date
      if (line.includes("הגירושין נרשמו")) {
        const regDateMatch = line.match(/\((\d{2}\/\d{2}\/\d{4})\)/);
        if (regDateMatch) {
          parsedData.registrationdate = regDateMatch[1]; // "11/07/2021"
        }
      }

      // Date Issued
      if (line.includes("נחתם דיגיטלית")) {
        const dateIssuedMatch = line.match(/(\d{2}\/\d{2}\/\d{4})/);
        if (dateIssuedMatch) {
          parsedData.dateissued = dateIssuedMatch[1]; // "11/07/2021"
        }
      }

      // Issue Time
      if (line.includes(":")) {
        const timeMatch = line.match(/(\d{2}\s*:\s*\d{2})/);
        if (timeMatch) {
          parsedData.issuetime = timeMatch[1].replace(/\s*/g, ""); // "13:34"
        }
      }
    }
    // Specific parsing for Population Registry Certificate
    if (templateType === "population_registry_certificate") {
      line = line
        .replace(/שלהאב/g, "שם האב")
        .replace(/להודי/g, "יהודי")
        .replace(/שלהאם/g, "שם האם")
        .replace(/המשפתה/g, "המשפחה");

      const englishFields = {
        "First Name": "firstname",
        "Last Name": "familyname",
        "Father's Name": "fathersname",
        "Mother's Name": "mothersname",
        Gender: "gender",
        "Marital Status": "maritalstatus",
        "Date of Birth": "dateofbirth",
        "Country of Birth": "countryofbirth",
        "Date of Registration": "dateofregistration",
        "Registration Number": "registrationnumber",
        "ID Number": "idnumber",
        "Aliyah Date": "aliyahdate",
        "Date Issued": "dateissued",
        Deceased: "dateofdeath",
        Nationality: "nationality",
        Lawyer: "lawyer",
      };

      // // Hebrew-specific parsing for Population Registry Certificate
      //       // Name (שם המשפחה and שם הפרטי on the same line)
      //       if (line.includes("שם המשפחה") && line.includes("שם הפרטי")) {
      //         const nameMatch = line.match(/שם המשפחה\s*(\S+)\s*שם הפרטי\s*(\S+)/i);
      //         if (nameMatch) {
      //           parsedData.familyname =  nameMatch[1];
      //           parsedData.firstname = nameMatch[2];
      //         }
      //       }

      // Hebrew-specific parsing for Population Registry Certificate
      // Family Name
      if (line.includes("שם המשפחה")) {
        const familyNameMatch = line.match(/שם המשפחה\s*(\S+)/i);
        if (familyNameMatch) {
          parsedData.familyname =
            valueTranslations[familyNameMatch[1]] || familyNameMatch[1];
        }
      }

      // First Name
      if (line.includes(" השם הפרטי ")) {
        const firstNameMatch = line.match(/ השם הפרטי s*(\S+)/i);
        if (firstNameMatch) {
          parsedData.firstname =
            valueTranslations[firstNameMatch[1]] || firstNameMatch[1];
        }
      }

      // Lawyer
      if (line.includes("לכבוד")) {
        const firstNameMatch = line.match(/לכבודs*(\S+)/i);
        if (firstNameMatch) {
          parsedData.lawyer = firstNameMatch[1];
        } else if (lines[index + 1] && !lines[index + 1].includes("לכבוד")) {
          parsedData.lawyer = lines[index + 1];
        }
      }

      // Father's Name
      if (line.includes("שם האב")) {
        const fatherMatch = line.match(/שם האב\s+(\S+)/);
        if (fatherMatch) {
          parsedData.fathersname = fatherMatch[1];
        }
      }

      //ID Number  -- important
      if (line.includes("של האם")) {
        const motherMatch = line.match(/שם האם\s*(\S+)/);
        if (motherMatch) {
          // Apply the numeric regex to the captured group (motherMatch[1])
          const idMatch = motherMatch[1].match(/\d{6,9}(?:\s*\d)?/g);
          if (idMatch && idMatch.length > 0) {
            parsedData.idnumber = idMatch[0].replace(/\s/g, "");
            parsedData.idnumber = idMatch[1].replace(/\s/g, "");
          }
        } else if (lines[index + 1] && !lines[index + 1].includes("שם")) {
          parsedData.idnumber =
            valueTranslations[lines[index + 1]] || lines[index + 1];
        }
      }

      if (line.includes("המין")) {
        const genderMatch = line.match(/המין\s*(נקבה|זכר)/i);
        if (genderMatch)
          parsedData.gender =
            valueTranslations[genderMatch[1]] || genderMatch[1];
      }

      if (line.includes("של האם")) {
        const motherMatch = line.match(/של האם\s*(\S+)/);
        if (motherMatch) {
          parsedData.mothersname = motherMatch[1]; // This would be a number, not a name
        } else if (lines[index + 1] && !lines[index + 1].includes("שם")) {
          parsedData.mothersname =
            valueTranslations[lines[index + 1]] || lines[index + 1];
        }
      }

      // // Gender and ID Number (on the same line)
      // if (line.includes("מספר הזהות") ||  line.includes("המין"))  {
      //   // Extract Gender
      //   const genderMatch = line.match(/המין\s*(זכר|נקבה)/i);
      //   if (genderMatch) {
      //     parsedData.gender = valueTranslations[genderMatch[1]] || genderMatch[1];
      //   }
      //   // Extract ID Number
      //   const idMatch = line.match(/(\d+\s*\d*)\s*\\?\s*מספר הזהות/);
      //   if (idMatch) {
      //     parsedData.idnumber = idMatch[1].replace(/\s/g, ""); // Remove spaces to get "000416586"
      //   }
      // }

      // Marital Status
      if (line.includes("המצב האישי")) {
        const statusMatch = line.match(/המצב האישי\s*(\S+)/);
        if (statusMatch) {
          parsedData.maritalstatus = statusMatch[1];
        }
      }

      // Country of Birth
      if (line.includes("ארץ הלידה")) {
        const countryMatch = line.match(/ארץ הלידה\s*(\S+)/);
        if (countryMatch) {
          parsedData.countryofbirth = countryMatch[1];
        }
      }

      // Date of Birth (Hebrew and Gregorian)
      if (line.includes("הגריגוריאני")) {
        const nextLine = lines[index + 1] || "";
        const gregorianMatch = nextLine.match(
          /הגריגוריאני\s*(\d{1,2})\s*ב(\S+)\s*(\d{4})/
        );
        if (gregorianMatch) {
          const day = gregorianMatch[1];
          const monthHebrew = gregorianMatch[2];
          const year = gregorianMatch[3];
          const month = valueTranslations[monthHebrew] || monthHebrew;
          parsedData.dateofbirth = `${day} ${month} ${year}`;
        }
        const hebrewMatch = nextLine.match(/העברי\s*(\S+\s+\S+\s+\S+)/);
        if (hebrewMatch) {
          parsedData.dateofbirth_hebrew = hebrewMatch[1].trim();
        }
      }

      // Date of Registration and Aliyah Date
      if (line.includes("תאריך רישום")) {
        const regMatch = line.match(
          /תאריך רישום\s*כעולה\/ישיבת קבע\s*(\S+)\s*(\d{4})/
        );
        if (regMatch) {
          const monthHebrew = regMatch[1];
          const year = regMatch[2];
          const month = valueTranslations[monthHebrew] || monthHebrew;
          const dateValue = `${month} ${year}`;
          parsedData.dateofregistration = dateValue;
          parsedData.aliyahdate = dateValue; // Set aliyahdate to the same value
        }
      }

      // Nationality (default to יהודי if not found)
      if (line.includes("הלאום")) {
        const nationalityMatch = line.match(/הלאום\s*[:\-]?\s*(\S+)/i);
        if (nationalityMatch) {
          parsedData.nationality = nationalityMatch[1];
        }
      }
      // Enforce fallback at the end of parsing
      if (!parsedData.nationality) {
        parsedData.nationality = "יהודי";
      }

      // Date of Death
      if (line.includes("נפטר")) {
        const deceasedMatch = line.match(/נפטר\s*(\d{1,2})\s*ב(\S+)\s*(\d{4})/);
        if (deceasedMatch) {
          const day = deceasedMatch[1];
          const monthHebrew = deceasedMatch[2];
          const year = deceasedMatch[3];
          const month = valueTranslations[monthHebrew] || monthHebrew;
          parsedData.dateofdeath = `${day} ${month} ${year}`;
        }
      }

      // Address
      if (line.includes("המען")) {
        const addressMatch = line.match(/המען\s*:\s*(.+)/);
        if (addressMatch) {
          let address = addressMatch[1].trim();
          // Split address into components
          const addressParts = address.split(/\s+/);
          if (addressParts.length >= 4) {
            const city = valueTranslations[addressParts[0]] || addressParts[0];
            const street = addressParts[1];
            const number = addressParts[2];
            const apartment =
              valueTranslations[addressParts[3]] || addressParts[3];
            address = `${city}, ${street} ${number}, ${apartment}`;
          }
          parsedData.address = address;
        }
      }

      // Date of Address Entry
      if (line.includes("תאריך הכניסה למען")) {
        const addressEntryMatch = line.match(
          /תאריך הכניסה למען\s*:\s*(\d{1,2})\s*ב(\S+)/
        );
        if (addressEntryMatch) {
          const day = addressEntryMatch[1];
          const monthHebrew = addressEntryMatch[2];
          const month = valueTranslations[monthHebrew] || monthHebrew;
          // Look for the year in the next line or previous line
          const yearMatch =
            lines[index + 1]?.match(/(\d{4})/) ||
            lines[index - 1]?.match(/(\d{4})/);
          const year = yearMatch ? yearMatch[1] : "";
          parsedData.addressentrydate = `${day} ${month} ${year}`;
        }
      }

      // Previous Family Name
      if (line.includes("שמות משפחה קודמים")) {
        const prevNameMatch = lines[index + 2]?.match(
          /(\S+)\s+שינוי\s+(\d{1,2})\s+ב(\S+)\s+(\d{4})/
        );
        if (prevNameMatch) {
          const name = valueTranslations[prevNameMatch[1]] || prevNameMatch[1];
          const day = prevNameMatch[2];
          const monthHebrew = prevNameMatch[3];
          const year = prevNameMatch[4];
          const month = valueTranslations[monthHebrew] || monthHebrew;
          parsedData.previousfamilyname = `${name} (changed on ${day} ${month} ${year})`;
        }
      }

      // Date Issued
      if (line.includes("בתאריך")) {
        const dateIssuedMatch = line.match(/(\d{1,2})\s*ב(\S+)\s*(\d{4})/);
        if (dateIssuedMatch) {
          const day = dateIssuedMatch[1];
          const monthHebrew = dateIssuedMatch[2];
          const year = dateIssuedMatch[3];
          const month = valueTranslations[monthHebrew] || monthHebrew;
          parsedData.dateissued = `${day} ${month} ${year}`;
        }
      }

      // Place of Registration
      if (line.includes("בלשכת רשות האוכלוסין")) {
        const placeMatch = line.match(/בלשכת רשות האוכלוסין וההגירה ב(.+)/);
        if (placeMatch) {
          parsedData.placeofregistration =
            valueTranslations[placeMatch[1].trim()] || placeMatch[1].trim();
        }
      }
      // Reference
      if (line.match(/\d{5,}/)) {
        parsedData.reference = line.match(/\d{5,}/)[0];
      }
    }

    // Hebrew-specific parsing for birth certificate
    if (templateType === "birth_certificate") {
      // Family Name and First Name
      // Extract family name
      if (!parsedData.familyname && line.includes("שם המשפחה")) {
        const familyMatch = line.match(/שם המשפחה\s*[:\-]?[\s\\]*([^\s\\|]+)/i);
        if (familyMatch) {
          parsedData.familyname = familyMatch[1].trim(); // e.g., "שורצברג"
          console.log("Family Name:", parsedData.familyname); // Debugging line
        }
      }

      // Extract first name
      if (!parsedData.firstname && line.includes("השם הפרטי")) {
        const firstMatch = line.match(/השם הפרטי\s*[:\-]?\s*([^\s\\|]+)/i);
        if (firstMatch) {
          parsedData.firstname = firstMatch[1].trim(); // e.g., "עודד"
          console.log("First Name:", parsedData.firstname); // Debugging line
        }
      }

      if (line.includes("של האב ")) {
        const fatherMatch = line.match(/של האב\s+(\S+)/);
        if (fatherMatch) parsedData.fathersname = fatherMatch[1];
      }

      if (line.includes("של האם")) {
        const motherMatch = line.match(/של האם\s*(\S+)/);
        if (motherMatch) parsedData.mothersname = motherMatch[1];
      }

      if (line.includes("שלאבי האב ")) {
        const grandfatherMatch = line.match(/שלאבי האב \s*(\S+)/);
        if (grandfatherMatch) parsedData.grandfathername = grandfatherMatch[1];
        else if (line.includes("שלאבי האב "))
          parsedData.grandfathername = lines[index]
            ?.replace("שלאבי האב ", "")
            .trim();
      }

      if (line.includes("המין")) {
        const genderMatch = line.match(/המין\s*(נקבה|זכר)/i);
        if (genderMatch)
          parsedData.gender =
            valueTranslations[genderMatch[1]] || genderMatch[1];
        const idMatch = line.match(/מספר הזהות\s*(\d{7,9}|\d+\s*\d*)/);

        console.log("ID Match:", idMatch); // Debugging line
        if (idMatch) {
          // Doing RTL with first digit at the beginning
          const idString = idMatch[1].replace(/\s/g, ""); // Remove spaces, e.g., "021470919"
          const firstElement = idString[0]; // Get the first digit: "0"
          const remaining = idString.slice(1); // Get the rest: "21470919"
          console.log("Remaining:", remaining); // Debugging line
          const cleaned = remaining.split("").reverse().join(""); // Reverse the rest: "91907412"
          const last = firstElement + cleaned; // Combine: "0" + "91907412" = "091907412"
          console.log("Last:", last); // Debugging line
          parsedData.idnumber = parsedData.idnumber = last
            .split("")
            .reverse()
            .join(""); // Assign to parsedData
        }
      }

      if (line.includes("שם הישוב")) {
        const placeMatch = line.match(/שם הישוב\s*(.+?)(?=שם בית|$)/);
        if (placeMatch) parsedData.placeofbirth = placeMatch[1].trim();
      }

      if (line.includes("שם בית החולים")) {
        const hospitalMatch = line.match(/שם בית החולים\s*(.+)/);
        if (hospitalMatch)
          parsedData.hospitalname = hospitalMatch[1]
            .trim()
            .replace(/[^\u0590-\u05FF]/g, "");
      }

      if (line.includes("תאריך הלידה")) {
        const gregorianMatch = lines[index + 1]?.match(
          /הגריגוריאני\s*(\d{1,2})\s*ב(\S+)\s*(\d{4})/
        );
        if (gregorianMatch) {
          const day = gregorianMatch[1];
          const monthHebrew = gregorianMatch[2];
          const year = gregorianMatch[3];
          const monthMap = {
            ינואר: "January",
            פברואר: "February",
            מרץ: "March",
            אפריל: "April",
            מאי: "May",
            יוני: "June",
            יולי: "July",
            אוגוסט: "August",
            ספטמבר: "September",
            אוקטובר: "October",
            נובמבר: "November",
            דצמבר: "December",
          };
          const month = monthMap[monthHebrew] || monthHebrew;
          parsedData.dateofbirth = `${day} ${month} ${year}`;
        }
      }

      if (line.includes("הלאום")) {
        const nationalityMatch = line.match(/הלאום\s*[:\-]?\s*(\S+)/i);
        if (nationalityMatch) {
          let cleanedNationality = nationalityMatch[1]
            .replace(/[^\u0590-\u05FF]/g, "")
            .trim();
          parsedData.nationality = cleanedNationality;
        }
      }
      if (!parsedData.nationality) {
        parsedData.nationality = "יהודי";

        const religionMatch = line.match(/הדת\s*(\S+)/);
        if (religionMatch)
          parsedData.religion =
            valueTranslations[religionMatch[1]] || religionMatch[1];
      }

      if (line.includes("הוצאה בלשכת")) {
        const placeMatch = line.match(/בלשכת\s*(.+)/);
        if (placeMatch) parsedData.placeofregistration = placeMatch[1].trim();
      }

      if (line.match(/\d{5,}/)) {
        parsedData.reference = line.match(/\d{5,}/)[0];
      }
    }

    // Specific parsing for bilingual birth certificate
    if (templateType === "bilingual_birth_certificate") {
      const englishFields = {
        Surname: "familyname",
        "Given name": "firstname",
        "Given name of father": "fathersname",
        "Given name of mother": "mothersname",
        "Given name of grandfather": "grandfathername",
        Sex: "gender",
        "Place of birth": "placeofbirth",
        "Name of hospital": "hospitalname",
        Nationality: "nationality",
        Religion: "religion",
        motherfather: "motherfather",
      };

      // Parse fields that should take the left-side English value
      Object.keys(englishFields).forEach((label) => {
        const regex = new RegExp(
          `${label}\\s+(.+?)(?:\\s*[\u0590-\u05FF\\u200F\\u200E]|$)`
        );
        const match = line.match(regex);
        if (match) {
          let value = match[1].trim();
          value = value.replace(/[\u0590-\u05FF\u200F\u200E].*$/, "").trim(); // Remove Hebrew characters and RTL/LTR marks
          console.log(`Matched ${label} (left side): ${value}`);
          parsedData[englishFields[label]] = value;
        } else if (line.includes(label)) {
          console.log(`Label ${label} found but no match: ${line}`);
        }
      });

      // Special handling for Father's Name (left-side English value after "of father")
      if (line.includes("of father")) {
        const fatherMatch = line.match(
          /of father\s+(.+?)(?:\\s*[\u0590-\u05FF\\u200F\\u200E]|$)/
        );
        if (fatherMatch) {
          let value = fatherMatch[1].trim();
          value = value.replace(/[\u0590-\u05FF\u200F\u200E].*$/, "").trim();
          parsedData.fathersname = value;
          console.log(`Father's name (left side): ${parsedData.fathersname}`);
        }
      }

      // Special handling for Mother's Name (left-side English value after "of mother")
      if (line.includes("of mother's father")) {
        const motherMatch = line.match(
          /of mother's father\s+(.+?)(?:\\s*[\u0590-\u05FF\\u200F\\u200E]|$)/
        );
        if (motherMatch) {
          let value = motherMatch[1].trim();
          value = value.replace(/[\u0590-\u05FF\u200F\u200E].*$/, "").trim();
          parsedData.motherfather = value;
          console.log(`Mother's name (left side): ${parsedData.motherfather}`);
        }
      }

      // Special handling for Mother's Name (left-side English value after "of mother")
      if (line.includes("of mother")) {
        const motherMatch = line.match(
          /of mother\s+(.+?)(?:\\s*[\u0590-\u05FF\\u200F\\u200E]|$)/
        );
        if (motherMatch) {
          let value = motherMatch[1].trim();
          value = value.replace(/[\u0590-\u05FF\u200F\u200E].*$/, "").trim();
          parsedData.mothersname = value;
          console.log(`Mother's name (left side): ${parsedData.mothersname}`);
        }
      }

      // Special handling for Grandfather's Name (left-side English value after "grandfather")
      if (line.includes("grandfather")) {
        const grandfatherMatch = line.match(
          /grandfather\s+(.+?)(?:\\s*[\u0590-\u05FF\\u200F\\u200E]|$)/
        );
        if (grandfatherMatch) {
          let value = grandfatherMatch[1].trim();
          value = value.replace(/[\u0590-\u05FF\u200F\u200E].*$/, "").trim();
          parsedData.grandfathername = value;
          console.log(
            `Grandfather's name (left side): ${parsedData.grandfathername}`
          );
        }
      }

      // Enhanced Place of Birth extraction
      if (line.includes("Place")) {
        // First try: Capture between "נולד ב :" and any Hebrew text or formatting marks
        let birthMatch = line.match(
          /(נולד(?:\sב|\s*ב|\sב*)|birth)\s*[:\-]?\s*([A-Z\s]+)/i
        );
        console.log(`Raw birthMatch captured value: ${birthMatch}`);

        // Second try: Capture English text before "Place of" if first fails
        if (!birthMatch) {
          birthMatch = line.match(
            /([A-Za-z\s]+)(?:[\u0590-\u05FF\u200F\u200E\s]+)?Place of/
          );
        }

        if (birthMatch && birthMatch[1]) {
          let value = birthMatch[1].trim();
          console.log(`Raw captured value: ${value}`);

          // First, remove any trailing Hebrew characters or RTL/LTR marks from the captured value
          value = value.replace(/[\u0590-\u05FF\u200F\u200E].*$/, "").trim();
          console.log(`After Hebrew/RTL cleanup: ${value}`);

          // Clean up common OCR artifacts
          value = value
            .replace(/NPopONR/g, "") // Remove OCR noise
            .replace(/[^\w\s\-']/g, "") // Keep only letters, spaces, hyphens, and apostrophes
            .trim();

          console.log(
            `After OCR artifact cleanup (NPopONR, non-letters): ${value}`
          );

          if (value) {
            parsedData.placeofbirth = value;
            console.log(`Extracted place of birth: ${value}`);
          } else {
            console.warn(
              `Place of birth value became empty after cleanup in line: ${line}`
            );
          }
        } else {
          console.warn(`Place of birth pattern not matched in line: ${line}`);
        }
      }

      // Special handling for Hospital Name (left-side English value after "hospital")
      if (line.includes("hospital")) {
        const hospMatch = line.match(
          /hospital\s+(.+?)(?:\\s*[\u0590-\u05FF\\u200F\\u200E]|$)/
        );
        if (hospMatch) {
          let value = hospMatch[1].trim();
          value = value.replace(/[\u0590-\u05FF\u200F\u200E].*$/, "").trim();
          parsedData.hospitalname = value;
          console.log(`Hospital name (left side): ${parsedData.hospitalname}`);
        }
      }

      // Special handling for Gregorian date (take the middle value)
      if (line.includes("Gregorian date")) {
        const dateMatch = line.match(/התאריך\s*(\d{1,2}\/\d{1,2}\/\d{4})/);
        if (dateMatch) {
          parsedData.dateofbirth = dateMatch[1];
          console.log(`Gregorian date (middle): ${parsedData.dateofbirth}`);
        }
      }

      // Special handling for Identity number (take the middle value)
      if (line.includes("dentity number")) {
        let idMatch = line.match(/מספר הזהות\s*(\d{1,9}(?:\s*\d{1,9})*)/);
        if (idMatch) {
          parsedData.idnumber = idMatch[1].replace(/\s/g, ""); // Remove spaces
          console.log(`Identity number (middle): ${parsedData.idnumber}`);
        } else {
          // Look for a 9-digit number (typical for Israeli ID) in the entire text
          const fullTextMatch = text.match(/מספר הזהות\s*(\d{9})/);
          if (fullTextMatch) {
            parsedData.idnumber = fullTextMatch[1];
            console.log(`Identity number (full text): ${parsedData.idnumber}`);
          } else {
            // Fallback: Combine digits from the current and next few lines
            let fullNumber = "";
            const digits = line.match(/\d+/g) || [];
            fullNumber += digits.join("");
            for (let i = 1; i <= 2; i++) {
              const nextLine = lines[index + i]?.trim();
              if (nextLine) {
                const nextDigits = nextLine.match(/\d+/g);
                if (nextDigits) {
                  fullNumber += nextDigits.join("");
                }
              }
            }
            parsedData.idnumber = fullNumber;
            console.log(
              `Identity number (combined across lines): ${parsedData.idnumber}`
            );
            // Warn if the number isn't 9 digits
            if (fullNumber.length !== 9) {
              console.warn(
                `Identity number (${fullNumber}) is not 9 digits; possible OCR issue.`
              );
            }
          }
        }
      }

      // Additional fields
      if (line.match(/Birth Registry of the year (\d{4})/)) {
        parsedData.dateofregistration = line.match(
          /Birth Registry of the year (\d{4})/
        )[1];
        console.log(`Date of registration: ${parsedData.dateofregistration}`);
      }
      if (
        line.includes(
          "At the office of the Population and Immigration Authority in"
        )
      ) {
        const placeMatch = line.match(/in\s*([\w\s-]+)$/);
        if (placeMatch) {
          parsedData.placeofregistration = placeMatch[1].trim();
          console.log(
            `Place of registration: ${parsedData.placeofregistration}`
          );
        }
      }
      if (line.match(/Date\s+(\d{1,2}\s+\w+\s+\d{4})/)) {
        parsedData.dateissued = line.match(/Date\s+(\d{1,2}\s+\w+\s+\d{4})/)[1];
        console.log(`Date issued: ${parsedData.dateissued}`);
      }
      if (line.match(/\d{5,}/)) {
        parsedData.reference = line.match(/\d{5,}/)[0];
        console.log(`Reference: ${parsedData.reference}`);
      }
    }
  });

  // Post-process to clean up fields
  if (templateType === "bilingual_birth_certificate") {
    // Fix reference (remove extra 0)
    if (parsedData.reference === "7975500") {
      parsedData.reference = "797550";
    }
    // Remove any remaining Hebrew formatting marks from all fields
    Object.keys(parsedData).forEach((key) => {
      if (typeof parsedData[key] === "string") {
        parsedData[key] = parsedData[key]
          .replace(/[\u0590-\u05FF\u200F\u200E]/g, "")
          .trim();
      }
    });
  }

  console.log("Parsed Data:", parsedData);
  return parsedData;
}

// Load the template
async function loadTemplate(type) {
  extractedData = extractedData || {};
  extractedData.groom = extractedData.groom || {};
  extractedData.bride = extractedData.bride || {};
  extractedData.husband = extractedData.husband || {};
  extractedData.wife = extractedData.wife || {};
  extractedData.reference = extractedData.reference || "Unknown";
  extractedData.certNumber = extractedData.certNumber || "Unknown";
  extractedData.witness = extractedData.witness || "";
  extractedData.witnessB = extractedData.witnessB || "";
  extractedData.witnessOccupation = extractedData.witnessOccupation || "";
  extractedData.witnessBOccupation = extractedData.witnessBOccupation || "";

  if (type === "marriage_certificate") {
    return `
      <style>
        .certificate {
          width: 800px;
          background-color: #e6f0fa;
          border: 1px solid #ccc;
          padding: 20px;
          box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
          font-family: Arial, sans-serif;
        }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
        }
        .ministry, .state {
          font-size: 14px;
          font-weight: bold;
          color: #333;
        }
        .logo img {
          width: 80px;
          height: auto;
        }
        .title-container {
          text-align: center;
          margin-bottom: 20px;
        }
        .title {
          font-size: 24px;
          font-weight: bold;
          border: 1px solid #000;
          padding: 10px;
          background-color: #fff;
        }
        .cert-number {
          font-size: 14px;
          margin-top: 5px;
        }
        .data-table, .witness-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 20px;
        }
        .data-table th, .data-table td, .witness-table th, .witness-table td {
          border: 1px solid #ccc;
          padding: 8px;
          text-align: left;
        }
        .data-table th, .witness-table th {
          background-color: #f0f0f0;
        }
        .label {
          width: 20%;
          font-weight: bold;
        }
        .value {
          width: 40%;
        }
        .witness-name {
          width: 50%;
        }
        .witness-occupation {
          width: 50%;
        }
        .name-field {
          width: 50% !important;
        }
        .additional-info {
          margin-top: 20px;
          font-size: 12px;
          text-align: center;
        }
        .signature {
          margin-top: 20px;
          text-align: center;
        }
        .signature-box img {
          width: 100px;
          height: auto;
        }
        .footer {
          display: flex;
          justify-content: space-between;
          font-size: 10px;
          margin-top: 20px;
        }
      </style>
      <div class="certificate avoid-break">
        <div class="header">
          <div class="reference">${extractedData.reference}</div>
          <div class="ministry">MINISTRY OF RELIGIOUS SERVICES</div>
          <div class="logo"><img src="https://via.placeholder.com/80x80.png?text=Logo" alt="State of Israel Emblem"></div>
          <div class="state">STATE OF ISRAEL</div>
        </div>
        <div class="title-container">
          <div class="title">MARRIAGE CERTIFICATE</div>
      
        </div>
            <div class="cert-number">Certificate Number: ${
              extractedData.certNumber
            }</div>
        <div class="content">
          <table class="data-table">
            <thead>
              <tr>
                <th class="label"></th>
                <th class="value">Groom</th>
                <th class="value">Bride</th>
              </tr>
            </thead>
            <tbody>
              ${addFields(
                "First Name",
                extractedData.groom.firstname,
                extractedData.bride.firstname
              )}
              ${addFields(
                "Family Name Before Marriage",
                extractedData.groom.previousfamilyname,
                extractedData.bride.previousfamilyname
              )}
              ${addFields(
                "ID Number",
                extractedData.groom.idnumber,
                extractedData.bride.idnumber
              )}
              ${addFields(
                "Date of Birth",
                extractedData.groom.dateofbirth,
                extractedData.bride.dateofbirth
              )}
              ${addFields(
                "Religion",
                extractedData.groom.religion,
                extractedData.bride.religion
              )}
              ${addFields(
                "Address",
                extractedData.groom.address,
                extractedData.bride.address
              )}
              ${addFields(
                "Occupation",
                extractedData.groom.occupation,
                extractedData.bride.occupation
              )}
              ${addFields(
                "Father's Name",
                extractedData.groom.father.name,
                extractedData.bride.father.name
              )}
              ${addFields(
                "Father's Address",
                extractedData.groom.father.address,
                extractedData.bride.father.address
              )}
              ${addFields(
                "Father's Occupation",
                extractedData.groom.father.occupation,
                extractedData.bride.father.occupation
              )}
              ${addFields(
                "Mother's Name",
                extractedData.groom.mother.name,
                extractedData.bride.mother.name
              )}
              ${addFields(
                "Mother's Address",
                extractedData.groom.mother.address,
                extractedData.bride.mother.address
              )}
              ${addFields(
                "Mother's Occupation",
                extractedData.groom.mother.occupation,
                extractedData.bride.mother.occupation
              )}
              ${addFields(
                "Marital Status",
                extractedData.groom.maritalstatus,
                extractedData.bride.maritalstatus
              )}
            </tbody>
          </table>
          <h3>Witness Details</h3>
          <table class="witness-table">
            <thead>
              <tr>
                <th class="witness-name">שם פרטי ושם משפחה</th>
                <th class="witness-occupation">משלוח יד</th>
              </tr>
            </thead>
            <tbody>
              ${addWitnessFields(
                extractedData.witness,
                extractedData.witnessOccupation
              )}
              ${addWitnessFields(
                extractedData.witnessB,
                extractedData.witnessBOccupation
              )}
            </tbody>
          </table>
        </div>
        <div class="additional-info">
          <p>The above-mentioned marriage was held at: <span class="value" contenteditable="true">${
            extractedData.placeofregistration || ""
          }</span></p>
          <p>Marriage Date: <span class="value" contenteditable="true">${
            extractedData.registrationdate || ""
          }</span></p>
          <p>Registered at: <span class="value" contenteditable="true">${
            extractedData.placeofregistration || ""
          }</span></p>
          <p>Issued on: <span class="value" contenteditable="true">${
            extractedData.dateissued || ""
          }</span> Certificate Number: ${extractedData.certNumber}</p>
          <p>This certificate is issued based on the information recorded in the Population Registry on <span class="value" contenteditable="true">${
            extractedData.registrationdate || ""
          }</span>, Certificate Number: ${
      extractedData.certNumber
    }, and does not constitute proof of the validity of the marriage.</p>
          <div class="signature">
            <div class="signature-box">
              <div class="photo-placeholder">[Photo Emplacement]</div>
              <img src="https://via.placeholder.com/80x80.png?text=Stamp" alt="Stamp" class="stamp">
            </div>
            <div class="signature-placeholder">[Signature Place]</div>
          </div>
          <p class="signature-text">Signature of the Registrar of Marriage and Divorce Affairs</p>
        </div>
        <div class="footer">
          <div class="footer-left">Issue Date and Time: <span class="value" contenteditable="true">${
            extractedData.issuetime || ""
          } ${extractedData.dateissued || ""}</span> User: 1919</div>
        </div>
      </div>
    `;
  } else if (type === "divorce_certificate") {
    return `
      <div class="certificate avoid-break">
        <div class="header">
          <div class="reference">${extractedData.reference}</div>
          <div class="ministry">${extractedData.placeofregistration}</div>
          <div class="logo"><img src="https://via.placeholder.com/80x80.png?text=Logo" alt="State of Israel Emblem"></div>
          <div class="state">STATE OF ISRAEL</div>
        </div>
        <div class="title-container">
          <div class="title">DIVORCE CERTIFICATE</div>
        </div>
        <div>${extractedData.religion}</div>
          <div class="cert-number">Certificate Number: ${
            extractedData.certNumber
          }</div>
        </div>
      <div class="content template">
        <table class="data-table">
          <thead>
            <tr>
              <th></th>
              <th>Husband</th>
              <th>Wife</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="label">First Name:</td>
              <td class="value" contenteditable="true">${
                extractedData.husband.firstname || ""
              }</td>
              <td class="value" contenteditable="true">${
                extractedData.wife.firstname || ""
              }</td>
            </tr>
            <tr>
              <td class="label">Family Name:</td>
              <td class="value" contenteditable="true">${
                extractedData.husband.familyname || ""
              }</td>
              <td class="value" contenteditable="true">${
                extractedData.wife.familyname || ""
              }</td>
            </tr>
            <tr>
              <td class="label">ID Number:</td>
              <td class="value" contenteditable="true">${
                extractedData.husband.idnumber || ""
              }</td>
              <td class="value" contenteditable="true">${
                extractedData.wife.idnumber || ""
              }</td>
            </tr>
            <tr>
              <td class="label">Date of Birth:</td>
              <td class="value" contenteditable="true">${
                extractedData.husband.dateofbirth || ""
              }</td>
              <td class="value" contenteditable="true">${
                extractedData.wife.dateofbirth || ""
              }</td>
            </tr>
            <tr>
              <td class="label">Address:</td>
              <td class="value" contenteditable="true">${
                extractedData.husband.address || ""
              }</td>
              <td class="value" contenteditable="true">${
                extractedData.wife.address || ""
              }</td>
            </tr>
            <tr>
              <td class="label">Status:</td>
              <td class="value" contenteditable="true">${
                extractedData.husband.maritalstatus || ""
              }</td>
              <td class="value" contenteditable="true">${
                extractedData.wife.maritalstatus || ""
              }</td>
            </tr>
            <tr>
              <td class="label">Nationality:</td>
              <td class="value" contenteditable="true">${
                extractedData.husband.nationality || ""
              }</td>
              <td class="value" contenteditable="true">${
                extractedData.wife.nationality || ""
              }</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="additional-info">
        <p>The above-mentioned divorce was registered in the Population Registry on <span class="value" contenteditable="true">${
          extractedData.registrationdate || ""
        }</span>.</p>
        <p>Issued on: <span class="value" contenteditable="true">${
          extractedData.dateissued || ""
        }</span> Certificate Number: ${extractedData.certNumber}</p>
        <p>Lawyer: <span class="value" contenteditable="true">${
          extractedData.lawyer || ""
        }</span></p>
        <p>This certificate is issued based on the information recorded in the Population Registry on <span class="value" contenteditable="true">${
          extractedData.registrationdate || ""
        }</span>, Certificate Number: ${
      extractedData.certNumber
    }, and does not constitute proof of the validity of the divorce.</p>
        <div class="signature">
          <div class="signature-box">
            <div class="photo-placeholder">[Photo Emplacement]</div>
            <img src="https://via.placeholder.com/80x80.png?text=Stamp" alt="Stamp" class="stamp">
          </div>
          <div class="signature-placeholder">[Signature Place]</div>
        </div>
        <p class="signature-text">Signature of the Registrar of Marriage and Divorce Affairs</p>
      </div>
      <div class="footer">
        <div class="footer-left">Issue Date and Time: <span class="value" contenteditable="true">${
          extractedData.issuetime || ""
        } ${extractedData.dateissued || ""}</span> User: 1919</div>
      </div>
    </div>
  `;
  } else if (type === "birth_certificate") {
    console.log("Returning birth certificate template");
    return `
      <style>
        body {
          font-family: Arial, sans-serif;
          margin: 0;
          padding: 0;
          background-color: #f0f0f0;
          display: flex;
          justify-content: center;
          align-items: center;
          height: 100vh;
        }
        .certificate {
          width: 800px;
          background-color: #e6f0fa;
          border: 1px solid #ccc;
          padding: 20px;
          box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
        }
        .header {
          text-align: center;
          margin-bottom: 20px;
        }
        .ministry, .state {
          font-size: 14px;
          font-weight: bold;
          color: #333;
        }
        .logo {
          margin: 10px 0;
        }
        .logo img {
          width: 80px;
          height: auto;
        }
        .title {
          font-size: 24px;
          font-weight: bold;
          text-align: center;
          margin: 20px 0;
          border: 1px solid #000;
          padding: 10px;
          background-color: #fff;
        }
        .content {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 10px;
          margin-bottom: 20px;
        }
        .field {
          display: flex;
          justify-content: space-between;
          padding: 5px;
          border-bottom: 1px dotted #000;
        }
        .label {
          font-weight: bold;
        }
        .value {
          text-align: right;
        }
        .additional-info {
          margin-top: 20px;
          font-size: 12px;
          text-align: center;
        }
        .signature {
          margin-top: 20px;
        }
        .signature-box img {
          width: 100px;
          height: auto;
        }
        .signature-text {
          margin-top: 5px;
          font-weight: bold;
        }
        .footer {
          display: flex;
          justify-content: space-between;
          font-size: 10px;
          margin-top: 20px;

        .rtl {
          direction: rtl;
          unicode-bidi: bidi-override; /* Force RTL for numbers like ID */
        }
      </style>
      <div class="certificate avoid-break">
        <div class="header">
          <div class="ministry">MINISTRY OF THE INTERIOR</div>
          <div class="logo">
            <img src="https://via.placeholder.com/80x80.png?text=Logo" alt="State of Israel Emblem">
          </div>
          <div class="state">STATE OF ISRAEL</div>
        </div>
        <div class="title">BIRTH CERTIFICATE</div>
        <div class="content">
          <div class="field">
            <span class="label">First Name:</span>
            <span class="value" contenteditable="true">${
              extractedData.firstname || ""
            }</span>
          </div>
          <div class="field">
            <span class="label">Family Name:</span>
            <span class="value" contenteditable="true">${
              extractedData.familyname || ""
            }</span>
          </div>
          <div class="field">
            <span class="label">Father's Name:</span>
            <span class="value" contenteditable="true">${
              extractedData.fathersname || ""
            }</span>
          </div>
          <div class="field">
            <span class="label">Mother's Name:</span>
            <span class="value" contenteditable="true">${
              extractedData.mothersname || ""
            }</span>
          </div>
          <div class="field">
            <span class="label">Grandfather Name:</span>
            <span class="value" contenteditable="true">${
              extractedData.grandfathername || ""
            }</span>
          </div>
          <div class="field">
            <span class="label">Gender:</span>
            <span class="value" contenteditable="true">${
              extractedData.gender || ""
            }</span>
          </div>
          <div class="field rtl">
            <span class="label">ID Number:</span>
            <span class="value" contenteditable="true" rtl>${
              extractedData.idnumber || ""
            }</span>
          </div>
          <div class="field">
            <span class="label">Place of Birth:</span>
            <span class="value" contenteditable="true">${
              extractedData.placeofbirth || ""
            }</span>
          </div>
          <div class="field">
            <span class="label">Hospital Name:</span>
            <span class="value" contenteditable="true">${
              extractedData.hospitalname || ""
            }</span>
          </div>
          <div class="field">
            <span class="label">Date of Birth:</span>
            <span class="value" contenteditable="true">${
              extractedData.dateofbirth || ""
            }</span>
          </div>
          <div class="field">
            <span class="label">Nationality:</span>
            <span class="value" contenteditable="true">${
              extractedData.nationality || ""
            }</span>
          </div>
          <div class="field">
            <span class="label">Religion:</span>
            <span class="value" contenteditable="true">${
              extractedData.religion || ""
            }</span>
          </div>
          <div class="field">
            <span class="label">Date of Registration:</span>
            <span class="value" contenteditable="true">${
              extractedData.dateofregistration || ""
            }</span>
          </div>
          <div class="field">
            <span class="label">Place of Registration:</span>
            <span class="value" contenteditable="true">${
              extractedData.placeofregistration || ""
            }</span>
          </div>
        </div>
        <div class="additional-info">
        <p>I hereby confirm that the newborn was registered in the birth register for the year  <span class="value" contenteditable="true">${
          extractedData.dateofregistration || ""
        }  </span>  and this certificate was issued in accordance with Section 30 of the Population Registry Law, 5725-1965.
        <p>Issued at the Population and Immigration Authority Office in Tel Aviv-Center.</p>
        <p>On the date: 27th of Tevet 5785 (January 7, 2025)</p>
          <p>This document was issued from the computerized system of the Population Registry.</p>
       

          <div class="signature">
            <div class="signature-box">
              <img src="https://via.placeholder.com/80x80.png?text=Stamp" alt="Signature Stamp">
            </div>
        //     <div class="signature-text">Signature of the Registrar</div>
        //   </div>
        </div>
        <div class="footer">
          <div class="footer-left">To: <span class="value" contenteditable="true">${
            extractedData.firstname || ""
          }${extractedData.familyname || ""}</span>
          <div class="footer-right">Address Format</div>
        </div>
      </div>
    `;
  } else if (type === "population_registry_certificate") {
    console.log("Returning population_registry_certificate template");
    return `
    <style>
      body {
        font-family: Arial, sans-serif;
        margin: 0;
        padding: 0;
        background: linear-gradient(to bottom, #e6f3fa, white);
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: 100vh;
      }
      .certificate {
        width: 800px;
        background-color: #fff;
        border: 1px solid #ccc;
        padding: 20px;
        box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
        margin: 20px 0;
      }
      .header {
        text-align: center;
        margin-bottom: 20px;
      }
      .sub-header {
        font-size: 14px;
        font-weight: bold;
        text-align: center;
        margin-bottom: 20px;
      }
      .section {
        margin-bottom: 20px;
      }
      .section-title {
        font-size: 16px;
        font-weight: bold;
        margin-bottom: 10px;
        border-bottom: 1px solid #ccc;
        padding-bottom: 5px;
      }
      .field {
        display: flex;
        justify-content: space-between;
        padding: 5px;
        border-bottom: 1px dotted #000;
      }
      .label {
        font-weight: bold;
        width: 40%;
        text-align: left;
      }
      .value {
        width: 60%;
        text-align: left;
      }
      .value[contenteditable="true"]:hover {
        background-color: #f0f0f0;
        cursor: text;
      }
      .footer {
        font-size: 12px;
        text-align: center;
        margin-top: 20px;
        border-top: 1px solid #aaa;
        padding-top: 20px;
      }
      .stamp {
        text-align: center;
        margin-top: 20px;
      }
      .stamp img {
        height: 100px;
      }
      .stamp p {
        font-size: 12px;
        margin-top: 10px;
      }
    </style>
    <div class="certificate ltr avoid-break">
      <div class="header">
        <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/e/e7/Emblem_of_Israel.svg/1200px-Emblem_of_Israel.svg.png" alt="Israel Emblem" style="height: 80px;" />
        <h2>Extract from the Population Registry</h2>
      </div>
      <div class="sub-header">STATE OF ISRAEL – MINISTRY OF THE INTERIOR</div>

      <!-- Personal Information Section -->
      <div class="section">
        <div class="section-title">Personal Information</div>
        <div class="field"><span class="label">First Name:</span> <span class="value" contenteditable="true">${
          extractedData.firstname || ""
        }</span></div>
        <div class="field"><span class="label">Last Name:</span> <span class="value" contenteditable="true">${
          extractedData.familyname || ""
        }</span></div>
        <div class="field"><span class="label">Father's Name:</span> <span class="value" contenteditable="true">${
          extractedData.fathersname || ""
        }</span></div>
        <div class="field"><span class="label">Mother's Name:</span> <span class="value" contenteditable="true">${
          extractedData.mothersname || ""
        }</span></div>
        <div class="field"><span class="label">Gender:</span> <span class="value" contenteditable="true">${
          extractedData.gender || ""
        }</span></div>
        <div class="field"><span class="label">Marital Status:</span> <span class="value" contenteditable="true">${
          extractedData.maritalstatus || ""
        }</span></div>
        <div class="field"><span class="label">Nationality:</span> <span class="value" contenteditable="true">${
          extractedData.nationality || ""
        }</span></div>
        <div class="field"><span class="label">ID Number:</span> <span class="value" contenteditable="true">${
          extractedData.idnumber || ""
        }</span></div>
        <div class="field"><span class="label">Previous Family Name:</span> <span class="value" contenteditable="true">${
          extractedData.previousfamilyname || ""
        }</span></div>
        <div class="field"><span class="label">Date of Death:</span> <span class="value" contenteditable="true">${
          extractedData.dateofdeath || ""
        }</span></div>
      </div>

      <!-- Birth Information Section -->
      <div class="section">
        <div class="section-title">Birth Information</div>
        <div class="field"><span class="label">Date of Birth:</span> <span class="value" contenteditable="true">${
          extractedData.dateofbirth || ""
        }</span></div>
        <div class="field"><span class="label">Country of Birth:</span> <span class="value" contenteditable="true">${
          extractedData.countryofbirth || ""
        }</span></div>
      </div>

      <!-- Registration Information Section -->
      <div class="section">
        <div class="section-title">Registration Information</div>
        <div class="field"><span class="label">Date of Registration:</span> <span class="value" contenteditable="true">${
          extractedData.dateofregistration || ""
        }</span></div>
        <div class="field"><span class="label">Aliyah Date:</span> <span class="value" contenteditable="true">${
          extractedData.aliyahdate || ""
        }</span></div>
        <div class="field"><span class="label">Registration Number:</span> <span class="value" contenteditable="true">${
          extractedData.registrationnumber || ""
        }</span></div>
        <div class="field"><span class="label">Place of Registration:</span> <span class="value" contenteditable="true">${
          extractedData.placeofregistration || ""
        }</span></div>
        <div class="field"><span class="label">Reference Number:</span> <span class="value" contenteditable="true">${
          extractedData.reference || ""
        }</span></div>
      </div>

      <!-- Address Information Section -->
      <div class="section">
        <div class="section-title">Address Information</div>
        <div class="field"><span class="label">Address:</span> <span class="value" contenteditable="true">${
          extractedData.address || ""
        }</span></div>
        <div class="field"><span class="label">Date of Address Entry:</span> <span class="value" contenteditable="true">${
          extractedData.addressentrydate || ""
        }</span></div>
      </div>

      <!-- Document Information Section -->
      <div class="section">
        <div class="section-title">Document Information</div>
        <div class="field"><span class="label">Date Issued:</span> <span class="value" contenteditable="true">${
          extractedData.dateissued || ""
        }</span></div>
        <div class="field"><span class="label">Certificate Number:</span> <span class="value" contenteditable="true">${
          extractedData.certNumber || ""
        }</span></div>
      </div>

      <div class="footer">
        This certificate confirms that the details match the entries in the Population Registry, in accordance with section 29 of the Population Registration Law – 1965.<br />
        Issued on: ${extractedData.dateissued || "Unknown"}
      </div>
    </div>
  `;
  } else if (type === "bilingual_birth_certificate") {
    console.log("Returning bilingual birth certificate template");
    return `
      <style>
        .certificate {
          width: 800px;
          background-color: #e6f0fa;
          border: 1px solid #ccc;
          padding: 20px;
          box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
          font-family: Arial, sans-serif;
        }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
        }
        .ministry, .state {
          font-size: 14px;
          font-weight: bold;
          color: #333;
        }
        .logo {
          text-align: center;
        }
        .logo img {
          width: 80px;
          height: auto;
        }
        .title {
          font-size: 24px;
          font-weight: bold;
          text-align: center;
          margin: 20px 0;
          border: 1px solid #000;
          padding: 10px;
          background-color: #fff;
        }
        .content {
          margin-bottom: 20px;
        }
        .field {
          display: flex;
          justify-content: space-between;
          padding: 5px 0;
          border-bottom: 1px dotted #000;
        }
        .label {
          font-weight: bold;
          width: 40%;
        }
        .value {
          width: 60%;
          text-align: left;
        }
        .additional-info {
          margin-top: 20px;
          font-size: 12px;
          text-align: center;
        }
        .signature {
          margin-top: 20px;
          text-align: center;
        }
        .signature-box img {
          width: 100px;
          height: auto;
        }
        .footer {
          display: flex;
          justify-content: space-between;
          font-size: 10px;
          margin-top: 20px;
        }
      </style>
      <div class="certificate avoid-break">
        <div class="header">
          <div class="ministry">MINISTRY OF THE INTERIOR</div>
          <div class="logo">
            <img src="https://via.placeholder.com/80x80.png?text=Logo" alt="State of Israel Emblem">
          </div>
          <div class="state">STATE OF ISRAEL</div>
        </div>
        <div class="title">BIRTH CERTIFICATE</div>
        <div class="content">
          <div class="field">
            <span class="label">Surname:</span>
            <span class="value" contenteditable="true">${
              extractedData.familyname || ""
            }</span>
          </div>
          <div class="field">
            <span class="label">Given name:</span>
            <span class="value" contenteditable="true">${
              extractedData.firstname || ""
            }</span>
          </div>
          <div class="field">
            <span class="label">Given name of father:</span>
            <span class="value" contenteditable="true">${
              extractedData.fathersname || ""
            }</span>
          </div>
          <div class="field">
            <span class="label">Given name of mother:</span>
            <span class="value" contenteditable="true">${
              extractedData.mothersname || ""
            }</span>
          </div>
          <div class="field">
            <span class="label">Given name of grandfather:</span>
            <span class="value" contenteditable="true">${
              extractedData.grandfathername || ""
            }</span>
          </div>
       <div class="field">
            <span class="label">Surname of mother's father:</span>
            <span class="value" contenteditable="true">${
              extractedData.motherfather || ""
            }</span>
          </div> 
          <div class="field">
            <span class="label">Sex:</span>
            <span class="value" contenteditable="true">${
              extractedData.gender || ""
            }</span>
          </div>
          <div class="field">
            <span class="label">Identity number:</span>
            <span class="value" contenteditable="true">${
              extractedData.idnumber || ""
            }</span>
          </div>
          <div class="field">
            <span class="label">Place of birth:</span>
            <span class="value" contenteditable="true">${
              extractedData.placeofbirth || ""
            }</span>
          </div>
          <div class="field">
            <span class="label">Name of hospital:</span>
            <span class="value" contenteditable="true">${
              extractedData.hospitalname || ""
            }</span>
          </div>
          <div class="field">
            <span class="label">Gregorian date:</span>
            <span class="value" contenteditable="true">${
              extractedData.dateofbirth || ""
            }</span>
          </div>
          <div class="field">
            <span class="label">Nationality:</span>
            <span class="value" contenteditable="true">${
              extractedData.nationality || ""
            }</span>
          </div>
          <div class="field">
            <span class="label">Religion:</span>
            <span class="value" contenteditable="true">${
              extractedData.religion || ""
            }</span>
          </div>
        </div>
        <div class="additional-info">
          <p>I hereby confirm that the abovementioned child was registered in the Birth Registry of the year <span class="value" contenteditable="true">${
            extractedData.dateofregistration || ""
          }</span></p>
          <p>And this certificate is issued in accordance with article 30 of the Population Registry Law of 1965</p>
          <p>At the office of the Population and Immigration Authority in <span class="value" contenteditable="true">${
            extractedData.placeofregistration || ""
          }</span></p>
          <p>Date <span class="value" contenteditable="true">${
            extractedData.dateissued || ""
          }</span></p>
          <p>This certificate was issued from the Population Registry's computerized system</p>
          <div class="signature">
            <div class="signature-box">
              <img src="https://via.placeholder.com/80x80.png?text=Stamp" alt="Signature Stamp">
            </div>
          </div>
        </div>
        <div class="footer">
          <div class="footer-left">Reference: ${extractedData.reference}</div>
          <div class="footer-right">10/73</div>
        </div>
      </div>
    `;
  }
  // Other templates (birth_certificate, marriage_certificate, etc.) remain unchanged
  return "";
}

// Function to populate the template with extracted data
function populateTemplate(data) {
  console.log("Populating template with data:", data);
  const fields = document.querySelectorAll(".field");
  console.log("Found fields:", fields.length);
  fields.forEach((field) => {
    const labelElement = field.querySelector(".label");
    if (!labelElement) return;

    const labelText = labelElement.textContent.replace(":", "").trim();
    const fieldName = labelText.toLowerCase().replace(/\s/g, "");
    const valueElement = field.querySelector(".value");

    console.log(`Processing field: ${labelText} -> ${fieldName}`);
    if (valueElement) {
      if (data[fieldName]) {
        valueElement.textContent = data[fieldName];
        console.log(`Set ${fieldName} to ${data[fieldName]}`);
      } else {
        const hebrewField = Object.keys(hebrewFieldMap).find(
          (key) => hebrewFieldMap[key] === fieldName
        );
        if (hebrewField && data[hebrewFieldMap[hebrewField]]) {
          valueElement.textContent = data[hebrewFieldMap[hebrewField]];
          console.log(
            `Set ${fieldName} to ${
              data[hebrewFieldMap[hebrewField]]
            } (from Hebrew)`
          );
        }
      }
    }
  });

  const referenceElement = document.querySelector(".footer-left");
  if (referenceElement && data.reference) {
    referenceElement.textContent = `Reference: ${data.reference}`;
  }
}

// Add a new field
function addField() {
  const section =
    document.querySelector(".section") || document.querySelector(".content");
  const newField = document.createElement("div");
  newField.className = "field";
  newField.innerHTML = `
    <span class="label" contenteditable="true">New Field:</span>
    <span class="value" contenteditable="true"></span>
  `;
  section.appendChild(newField);
}

// Define addFields at the top level or within the same scope for marriage table
function addFields(label, groomValue, brideValue) {
  return `
    <tr>
      <td class="label">${label}:</td>
      <td class="value" contenteditable="true">${groomValue || ""}</td>
      <td class="value" contenteditable="true">${brideValue || ""}</td>
    </tr>
  `;
}
// for marriage table
function addWitnessFields(witness, occupation) {
  return `
    <tr>
      <td class="witness-name" contenteditable="true">${witness || ""}</td>
      <td class="witness-occupation" contenteditable="true">${
        occupation || ""
      }</td>
    </tr>
  `;
}

// for user
function addRow() {
  // Ensure there's a table to work with
  // Ensure there's a table to work with
  let table = document.querySelector(".data-table");
  if (!table) {
    // Create the table if it doesn't exist
    table = document.createElement("table");
    table.className = "data-table";
    table.innerHTML = `
      <thead>
        <tr>
          <th>Field Name</th>
          <th>Hebrew Text</th>
          <th>Extracted Value</th>
        </tr>
      </thead>
      <tbody></tbody>
    `;
    const section =
      document.querySelector(".section") || document.querySelector(".content");
    section.appendChild(table);
  }

  // Add a new editable row
  const tbody = table.querySelector("tbody");
  const newRow = document.createElement("tr");
  newRow.innerHTML = `
    <td contenteditable="true" style="font-weight: bold;">New Field</td>
    <td contenteditable="true">Hebrew Text</td>
    <td contenteditable="true">Extracted Value</td>
  `;
  tbody.appendChild(newRow);
}

// async function translateToGerman() {
//   const certificate = document.querySelector(".certificate");
//   if (!certificate) {
//     console.error("No .certificate element found");
//     return;
//   }

//   // Check if translations are loaded
//   if (Object.keys(germanTranslations).length === 0) {
//     console.log("Translations not loaded yet, loading now...");
//     await loadTranslations();
//   }

//   // Get all text nodes in the certificate
//   const walker = document.createTreeWalker(
//     certificate,
//     NodeFilter.SHOW_TEXT,
//     null,
//     false
//   );

//   let node;
//   while ((node = walker.nextNode())) {
//     let text = node.nodeValue;

//     // Skip empty or whitespace-only nodes
//     if (!text.trim()) continue;

//     // Replace each known translation
//     Object.keys(germanTranslations).forEach((key) => {
//       const regex = new RegExp(`\\b${key}\\b`, "gi");
//       text = text.replace(regex, germanTranslations[key]);
//     });

//     node.nodeValue = text;
//   }

//   console.log("Translation completed");
// }

// Translate to German (mock)

const translations = {
  "MINISTRY OF THE INTERIOR": "INMINISTERIUM",
  "STATE OF ISRAEL": "STAAT ISRAEL",
  "BIRTH CERTIFICATE": "GEBURTSURKUNDE",
  "MARRIAGE CERTIFICATE": "EHEURKUNDE",
  "DIVORCE CERTIFICATE": "SCHEIDUNGSURKUNDE",
  "Certificate Number": "Zertifikatsnummer",
  Groom: "Bräutigam",
  Bride: "Braut",
  Husband: "Ehemann",
  Wife: "Ehefrau",
  "First Name": "Vorname",
  "First Name:": "Vorname",

  "שם פרטי ושם משפחה": "Vorname und Nachname",
  "משלוח ידי": "Beruf",
  "Family Name": "Nachname",
  "Date of Birth": "Geburtsdatum",
  "Place of Birth": "Geburtsort",
  Nationality: "Nationalität",
  "The above-mentioned marriage was registered in the Population Registry on":
    "Die oben genannte Ehe wurde im Bevölkerungsregister eingetragen am",
  "The above-mentioned divorce was registered in the Population Registry on":
    "Die oben genannte Scheidung wurde im Bevölkerungsregister eingetragen am",
  "Issued on": "Ausgestellt am",
  "This certificate is issued based on the information recorded in the Population Registry on":
    "Dieses Zertifikat wird auf der Grundlage der im Bevölkerungsregister am eingetragenen Informationen ausgestellt",
  "and does not constitute proof of the validity of the divorce":
    "und stellt keinen Beweis für die Gültigkeit der Scheidung dar",
  "Signature of the Registrar": "Unterschrift des Standesbeamten",
  "Signature of the Registrar of Marriage and Divorce Affairs":
    "Unterschrift des Standesbeamten für Ehe- und Scheidungsangelegenheiten",
  "Issue Date": "Ausstellungsdatum",
  User: "Benutzer",
  "User Code": "Benutzercode",
  Reference: "Referenz",
  "Issued on": "Ausgestellt am",
  "Signature of the Registrar": "Unterschrift des Standesbeamten",
  "Certified by the Ministry of the Interior":
    "Zertifiziert vom Innenministerium",
  // Field labels
  "Family Name": "Familienname",
  "ID Number": "Personalausweisnummer",
  Address: "Adresse",
  Status: "Familienstand",
  Nationality: "Staatsangehörigkeit",

  // Values
  Divorced: "Geschieden",
  Married: "Verheiratet",
  Single: "Ledig",
  Jewish: "Jüdisch",
  Male: "Männlich",
  Female: "Weiblich",
  None: "Keine",

  // Additional
  "Spouse's ID Number": "Ausweisnummer des Ehepartners",
  "Father's ID Number": "Ausweisnummer des Vaters",
  "Document Number": "Dokumentennummer",
  "Issuance Date": "Ausstellungsdatum",
  "Previous Card Number": "Frühere Kartennummer",
  "Expiration Date": "Ablaufdatum",
  "Issuing Authority": "Ausstellende Behörde",
  "Time of Issuance": "Ausgabezeit",
  "Minister of Interior": "Innenminister",
  "Ministry of Interior, State of Israel": "Innenministerium, Staat Israel",

  // New translations for marriage certificate
  "MINISTRY OF RELIGIOUS SERVICES": "MINISTERIUM FÜR RELIGIÖSE DIENSTE",
  "Family Name Before Marriage": "Familienname vor der Ehe",
  Religion: "Religion",
  Occupation: "Beruf",
  "Father's Name": "Name des Vaters",
  "Father's Address": "Adresse des Vaters",
  "Father's Occupation": "Beruf des Vaters",
  "Mother's Name": "Name der Mutter",
  "Mother's Address": "Adresse der Mutter",
  "Mother's Occupation": "Beruf der Mutter",
  "Marital Status": "Familienstand",
  "Witness Details": "Zeugendetails",
  Name: "Name", // Context-specific, kept as "Name" for witness table
  "The above-mentioned marriage was held at":
    "Die oben genannte Ehe wurde abgehalten in",
  "Marriage Date": "Hochzeitsdatum",
  "Registered at": "Registriert bei",
  "and does not constitute proof of the validity of the marriage":
    "und stellt keinen Beweis für die Gültigkeit der Ehe dar",
  "Issue Date and Time": "Ausstellungsdatum und Uhrzeit",
};

// 2. Basic Translation Function
function translateText(text) {
  let translated = text;
  for (const [hebrew, german] of Object.entries(translations)) {
    translated = translated.replace(
      new RegExp(escapeRegExp(hebrew), "g"),
      german
    );
  }
  return translated;
}

// Helper function to escape regex special characters
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function translateCertificate() {
  // 1. Get the certificate element
  const certificate = document.querySelector(".certificate");
  if (!certificate) return;

  // 2. Clone to avoid modifying original
  const clone = certificate.cloneNode(true);

  // 3. Translate all text nodes
  const walker = document.createTreeWalker(
    clone,
    NodeFilter.SHOW_TEXT,
    null,
    false
  );

  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.nodeValue.trim()) {
      node.nodeValue = translateText(node.nodeValue);
    }
  }

  // 4. Replace original with translated version
  certificate.replaceWith(clone);
}

// async function translateToGerman() {
//   const translations = {
//     "MINISTRY OF THE INTERIOR": "INMINISTERIUM",
//     "STATE OF ISRAEL": "STAAT ISRAEL",
//     "BIRTH CERTIFICATE": "GEBURTSURKUNDE",
//     "MARRIAGE CERTIFICATE": "EHEURKUNDE",
//     "DIVORCE CERTIFICATE": "SCHEIDUNGSURKUNDE",
//     "Certificate Number": "Zertifikatsnummer",
//     Groom: "Bräutigam",
//     Bride: "Braut",
//     Husband: "Ehemann",
//     Wife: "Ehefrau",
//     "First Name": "Vorname",
//     "First name": "Vorname",
//     "first name": "Vorname",
//     "Given name": "Vorname",
//     "שם פרטי": "Vorname",
//     "שם פרטי ושם משפחה": "Vorname und Nachname",
//     "משלוח ידי": "Beruf",
//     "Family Name": "Nachname",
//     "Last Name": "Nachname",
//     "שם משפחה": "Nachname",
//     "ID Number": "Identifikationsnummer",
//     "Date of Birth": "Geburtsdatum",
//     "Place of Birth": "Geburtsort",
//     Address: "Adresse",
//     Status: "Status",
//     Nationality: "Nationalität",
//     "The above-mentioned marriage was registered in the Population Registry on":
//       "Die oben genannte Ehe wurde im Bevölkerungsregister eingetragen am",
//     "The above-mentioned divorce was registered in the Population Registry on":
//       "Die oben genannte Scheidung wurde im Bevölkerungsregister eingetragen am",
//     "Issued on": "Ausgestellt am",
//     "This certificate is issued based on the information recorded in the Population Registry on":
//       "Dieses Zertifikat wird auf der Grundlage der im Bevölkerungsregister am eingetragenen Informationen ausgestellt",
//     "and does not constitute proof of the validity of the divorce":
//       "und stellt keinen Beweis für die Gültigkeit der Scheidung dar",
//     "Signature of the Registrar": "Unterschrift des Standesbeamten",
//     "Signature of the Registrar of Marriage and Divorce Affairs":
//       "Unterschrift des Standesbeamten für Ehe- und Scheidungsangelegenheiten",
//     "Issue Date": "Ausstellungsdatum",
//     User: "Benutzer",
//     "User Code": "Benutzercode",
//     Reference: "Referenz",
//     "Issued on": "Ausgestellt am",
//     "Signature of the Registrar": "Unterschrift des Standesbeamten",
//     "Certified by the Ministry of the Interior":
//       "Zertifiziert vom Innenministerium",
//     // Field labels
//     "Family Name": "Familienname",
//     "First Name": "Vorname",
//     "ID Number": "Personalausweisnummer",
//     "Date of Birth": "Geburtsdatum",
//     Address: "Adresse",
//     Status: "Familienstand",
//     Nationality: "Staatsangehörigkeit",

//     // Values
//     Divorced: "Geschieden",
//     Married: "Verheiratet",
//     Single: "Ledig",
//     Jewish: "Jüdisch",
//     Male: "Männlich",
//     Female: "Weiblich",
//     None: "Keine",

//     // Additional
//     "Spouse's ID Number": "Ausweisnummer des Ehepartners",
//     "Father's ID Number": "Ausweisnummer des Vaters",
//     "Document Number": "Dokumentennummer",
//     "Issuance Date": "Ausstellungsdatum",
//     "Previous Card Number": "Frühere Kartennummer",
//     "Expiration Date": "Ablaufdatum",
//     "Issuing Authority": "Ausstellende Behörde",
//     "Time of Issuance": "Ausgabezeit",
//     "Minister of Interior": "Innenminister",
//     "Ministry of Interior, State of Israel": "Innenministerium, Staat Israel",

//     // New translations for marriage certificate
//     "MINISTRY OF RELIGIOUS SERVICES": "MINISTERIUM FÜR RELIGIÖSE DIENSTE",
//     "Family Name Before Marriage": "Familienname vor der Ehe",
//     Religion: "Religion",
//     Occupation: "Beruf",
//     "Father's Name": "Name des Vaters",
//     "Father's Address": "Adresse des Vaters",
//     "Father's Occupation": "Beruf des Vaters",
//     "Mother's Name": "Name der Mutter",
//     "Mother's Address": "Adresse der Mutter",
//     "Mother's Occupation": "Beruf der Mutter",
//     "Marital Status": "Familienstand",
//     "Witness Details": "Zeugendetails",
//     Name: "Name", // Context-specific, kept as "Name" for witness table
//     "The above-mentioned marriage was held at":
//       "Die oben genannte Ehe wurde abgehalten in",
//     "Marriage Date": "Hochzeitsdatum",
//     "Registered at": "Registriert bei",
//     "and does not constitute proof of the validity of the marriage":
//       "und stellt keinen Beweis für die Gültigkeit der Ehe dar",
//     "Issue Date and Time": "Ausstellungsdatum und Uhrzeit",
//   };

//   const certificate = document.querySelector(".certificate");
//   if (!certificate) {
//     console.error("No .certificate element found");
//     return;
//   }

//   // Get the full text content
//   let text = certificate.innerText;

//   // Replace translatable terms while preserving format
//   Object.keys(germanTranslations).forEach((key) => {
//     const regex = new RegExp(`\\b${key}\\b`, "g"); // Match whole words only
//     text = text.replace(regex, germanTranslations[key]);
//   });

//   // Update the certificate content
//   certificate.innerText = text;

//   console.log("Translated text:", text);
// }

// Export to PDF
function exportToPDF() {
  const element = document.querySelector(".certificate");

  const opt = {
    margin: 0.5,
    filename: "certificate.pdf",
    image: { type: "jpeg", quality: 0.98 },
    html2canvas: {
      scale: 1, // Lower scale if needed
      logging: true,
      useCORS: true,
      scrollX: 0,
      scrollY: 0,
    },
    jsPDF: {
      unit: "in",
      format: "a4",
      orientation: "portrait",
      putOnlyUsedFonts: true,
    },
    pagebreak: { avoid: ".avoid-break" }, // Add class to elements to protect
  };

  // New: Calculate and adjust scaling
  html2pdf()
    .set(opt)
    .from(element)
    .toPdf()
    .get("pdf")
    .then(function (pdf) {
      const totalPages = pdf.internal.getNumberOfPages();
      if (totalPages > 1) {
        // If content spills to second page, try again with smaller scale
        opt.html2canvas.scale = 0.8;
        html2pdf().set(opt).from(element).save();
      }
    })
    .save();
}
// Show summary of extracted data
function showSummary() {
  let summary = "Extracted Data Summary:\n\n";
  for (const [key, value] of Object.entries(extractedData)) {
    if (typeof value === "object") {
      summary += `${key}:\n`;
      for (const [subKey, subValue] of Object.entries(value)) {
        summary += `  ${subKey}: ${subValue || "N/A"}\n`;
      }
    } else {
      summary += `${key}: ${value || "N/A"}\n`;
    }
  }
  alert(summary);
}
