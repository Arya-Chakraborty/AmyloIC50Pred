from flask import Flask, request, jsonify
import numpy as np
import pandas as pd
import pickle as pkl
from padelpy import from_smiles
from flask_cors import CORS
import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email import encoders
import csv
from io import StringIO
import threading
import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv

app = Flask(__name__)
CORS(app)

load_dotenv()
# Database configuration
DATABASE_URL = os.getenv('DATABASE_URL')

def get_db_connection():
    """Get database connection"""
    return psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)

def check_user_exists(email):
    """Check if user exists in database by email"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT email FROM users WHERE email = %s", (email,))
        result = cursor.fetchone()
        cursor.close()
        conn.close()
        return result is not None
    except Exception as e:
        print(f"Database error checking user: {e}")
        return False

def create_user(email, name, affiliation):
    """Create new user in database"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO users (email, name, affiliation) VALUES (%s, %s, %s)",
            (email, name, affiliation)
        )
        conn.commit()
        cursor.close()
        conn.close()
        return True
    except Exception as e:
        print(f"Database error creating user: {e}")
        return False

def send_results_email(user_email, results_data):
    """
    Send prediction results via email as CSV attachment
    """
    try:
        # Create CSV content
        csv_content = StringIO()
        
        # Define descriptor columns
        descriptors = ['RDF20e', 'SpMin2_Bhm', 'WPSA-3', 'SpMin2_Bhe', 'RDF125i', 'RDF120s', 
                      'RDF20i', 'ALogP', 'RDF20u', 'RDF135u', 'RDF20s', 'RDF20v', 'RDF135v', 
                      'RDF115s', 'BCUTc-1h', 'RDF125u', 'RDF130m', 'RDF130u', 'BCUTw-1h', 
                      'RDF20p', 'RDF125s', 'RDF130v', 'RDF125e', 'RDF115m', 'RDF110s', 'nBondsD',
                      'minssCH2', 'TDB1i', 'SHAvin', 'PPSA-3', 'Du', 'nHdsCH', 'SpMin2_Bhe', 
                      'SHBint4', 'minHBint4', 'AATS3v', 'TDB1u', 'TDB5m', 'ATSC2m', 'MATS5s', 
                      'TDB3i', 'VR2_D', 'GATS2i']
        
        headers = ["ID", "Compound (SMILES)", "Type", "Class", "IC50 (nM)"] + descriptors
        
        writer = csv.writer(csv_content)
        writer.writerow(headers)
        
        for idx, prediction in enumerate(results_data):
            row = [
                idx + 1,
                prediction['smiles'],
                prediction['classification'].capitalize(),
                prediction['class'] if prediction['class'] is not None else 'N/A',
                f"{prediction['ic50']:.2f}" if prediction['ic50'] is not None else 'N/A'
            ]
            
            # Add descriptor values
            for desc in descriptors:
                if 'descriptors' in prediction and desc in prediction['descriptors']:
                    value = prediction['descriptors'][desc]
                    if value is not None:
                        row.append(f"{value:.4f}")
                    else:
                        row.append('0.0000')
                else:
                    row.append('0.0000')
            
            writer.writerow(row)
        
        # Create email
        msg = MIMEMultipart()
        msg['From'] = "amyloic50pred@gmail.com"
        msg['To'] = user_email
        msg['Subject'] = "Amylo-IC50Pred Results - Large Batch Processing"
        
        body = f"""Dear User,

Thank you for using Amylo-IC50Pred!

Your large batch prediction job has been completed. Please find the results attached as a CSV file.

Batch Summary:
- Total compounds processed: {len(results_data)}
- Results include molecular descriptors and IC50 predictions

Best regards,
Amylo-IC50Pred Team
"""
        
        msg.attach(MIMEText(body, 'plain'))
        
        # Attach CSV file
        csv_data = csv_content.getvalue().encode('utf-8')
        attachment = MIMEBase('application', 'octet-stream')
        attachment.set_payload(csv_data)
        encoders.encode_base64(attachment)
        attachment.add_header(
            'Content-Disposition',
            f'attachment; filename="amylo-ic50pred-results-{len(results_data)}-compounds.csv"'
        )
        msg.attach(attachment)
        
        # Send email
        server = smtplib.SMTP('smtp.gmail.com', 587)
        server.starttls()
        server.login("amyloic50pred@gmail.com", "cimo qaxo dwle rpag")
        server.send_message(msg)
        server.quit()
        
        print(f"Results email sent successfully to {user_email}")
        return True
        
    except Exception as e:
        print(f"Failed to send email to {user_email}: {str(e)}")
        return False

def smiles_to_descriptors(smiles_list, compiled_data_path):
    """
    Converts SMILES strings to molecular descriptors using PaDEL-Py and filters them
    to match the descriptors in the reference dataset.
    
    Process:
    1. Loads the reference dataset to get the expected descriptor columns
    2. For each SMILES string, generates molecular descriptors using PaDEL
    3. Filters and aligns the generated descriptors to match the reference dataset
    4. Handles any missing columns by adding them with NaN values
    
    Args:
        smiles_list (list): List of SMILES strings to process
        compiled_data_path (str): Path to the reference dataset CSV file
        
    Returns:
        pd.DataFrame: DataFrame with descriptors matching the reference dataset columns
    """
    # Load reference dataset to get expected descriptor columns
    compiled_df = pd.read_csv(compiled_data_path)
    # Exclude target columns ('Class' and 'IC50') to get just the feature columns
    reference_descriptors = compiled_df.drop(['Class', 'IC50'], axis=1, errors='ignore').columns.tolist()

    all_descriptors_list = []

    # Process each SMILES string to generate descriptors
    for smiles in smiles_list:
        try:
            # Generate descriptors using PaDEL with timeout for safety
            descriptors = from_smiles(smiles, timeout=60)
            all_descriptors_list.append(descriptors)
        except Exception as e:
            # If descriptor generation fails, append empty dict
            all_descriptors_list.append({})

    # Create DataFrame from generated descriptors
    descriptors_df = pd.DataFrame(all_descriptors_list)

    # Filter columns to only include those present in reference dataset
    filtered_descriptors_df = descriptors_df[
        [col for col in reference_descriptors if col in descriptors_df.columns]
    ]

    # Add any missing columns from reference with NaN values
    for col in reference_descriptors:
        if col not in filtered_descriptors_df.columns:
            filtered_descriptors_df[col] = np.nan

    # Ensure column order matches reference dataset
    filtered_descriptors_df = filtered_descriptors_df[reference_descriptors]

    # Get important descriptors data
    important_descriptors = ['RDF20e', 'SpMin2_Bhm', 'WPSA-3', 'SpMin2_Bhe', 'RDF125i', 'RDF120s', 
                           'RDF20i', 'ALogP', 'RDF20u', 'RDF135u', 'RDF20s', 'RDF20v', 'RDF135v', 
                           'RDF115s', 'BCUTc-1h', 'RDF125u', 'RDF130m', 'RDF130u', 'BCUTw-1h', 
                           'RDF20p', 'RDF125s', 'RDF130v', 'RDF125e', 'RDF115m', 'RDF110s', 'nBondsD',
                           'minssCH2', 'TDB1i', 'SHAvin', 'PPSA-3', 'Du', 'nHdsCH', 'SpMin2_Bhe', 
                           'SHBint4', 'minHBint4', 'AATS3v', 'TDB1u', 'TDB5m', 'ATSC2m', 'MATS5s', 
                           'TDB3i', 'VR2_D', 'GATS2i']
    
    # Extract important descriptor values for each compound
    important_descriptor_values = []
    for idx in range(len(filtered_descriptors_df)):
        compound_descriptors = {}
        for desc in important_descriptors:
            if desc in filtered_descriptors_df.columns:
                value = filtered_descriptors_df.iloc[idx][desc]
                try:
                    # Handle empty strings, NaN, and other non-numeric values
                    if pd.notna(value) and str(value).strip() != '':
                        compound_descriptors[desc] = float(value)
                    else:
                        compound_descriptors[desc] = None
                except (ValueError, TypeError):
                    # If conversion to float fails, set to None
                    compound_descriptors[desc] = None
            else:
                compound_descriptors[desc] = None
        important_descriptor_values.append(compound_descriptors)

    return filtered_descriptors_df, important_descriptor_values

def preprocessing(df):
    """
    Preprocesses the descriptors dataframe to prepare for model prediction.
    
    Process:
    1. Loads the reference dataset to get value ranges
    2. Converts all values to numeric (coercing errors to NaN)
    3. Caps values to the min/max ranges from the reference dataset
    4. Imputes missing values using a pre-trained imputer
    
    Args:
        df (pd.DataFrame): DataFrame of molecular descriptors
        
    Returns:
        pd.DataFrame: Preprocessed DataFrame ready for model prediction
    """
    script_dir = os.path.dirname(__file__)
    compiled_data_path = os.path.join(script_dir, 'datasets', 'Compiled_data.csv')
    df_cols = pd.read_csv(compiled_data_path)
    df_cols = df_cols.iloc[:, 1:]
    
    # Ensure only expected columns are present and make a copy
    df = df[df_cols.drop(['Class', 'IC50'], axis=1, errors='ignore').columns].copy()

    # Convert all values to numeric
    for col in df:
        df[col] = pd.to_numeric(df[col], errors='coerce')
    
    # Cap values to reference dataset ranges
    for col in df.columns:
        max_val = df_cols[col].max()
        min_val = df_cols[col].min()
        df[col] = np.clip(df[col], min_val, max_val)

    # Impute missing values using pre-trained imputer
    imputer_model_path = os.path.join(script_dir, 'models', 'imputer_model.pkl')
    with open(imputer_model_path, 'rb') as f:
        imputer = pkl.load(f)
    df = imputer.transform(df)
    df = pd.DataFrame(df, columns=df_cols.drop(['Class', 'IC50'], axis=1, errors='ignore').columns)

    return df

def decoy_inhibitor_classification(df):
    """
    Classifies compounds as either decoys (0) or inhibitors (1).
    
    Args:
        df (pd.DataFrame): Preprocessed descriptors DataFrame
        
    Returns:
        pd.DataFrame: Original DataFrame with added 'D/I' column containing predictions
    """
    script_dir = os.path.dirname(__file__)
    decoy_inhibitor_model_path = os.path.join(script_dir, 'models', 'decoy_inhibitor_rf.pkl')
    with open(decoy_inhibitor_model_path, 'rb') as f:
        decoy_inhibitor = pkl.load(f)
    y_pred = decoy_inhibitor.predict(df)
    df['D/I'] = y_pred
    return df

def potency_classification(df):
    """
    Classifies inhibitors into potency classes (0-4).
    
    Args:
        df (pd.DataFrame): DataFrame containing inhibitor descriptors
        
    Returns:
        pd.DataFrame: Original DataFrame with added 'Class' column containing predictions
    """
    script_dir = os.path.dirname(__file__)
    classifier_model_path = os.path.join(script_dir, 'models', 'HGB_model_potency_classifier.pkl')
    with open(classifier_model_path, 'rb') as f:
        classifier = pkl.load(f)
    y_pred = classifier.predict(df)
    df['Class'] = y_pred
    return df

def ic50_regression(df):
    """
    Predicts IC50 values for inhibitor compounds.
    
    Process:
    1. Loads the regression model and required feature columns
    2. For each sample, selects the required features and makes prediction
    3. Applies polynomial coefficients to convert prediction to IC50 value
    
    Args:
        df (pd.DataFrame): DataFrame containing inhibitor descriptors with Class
        
    Returns:
        pd.DataFrame: DataFrame with IC50 predictions added
    """
    if df.empty:
        return pd.DataFrame()
    
    script_dir = os.path.dirname(__file__)
    regression_model_path = os.path.join(script_dir, 'models', 'rf_model_regression.pkl')
    compiled_data_csv = os.path.join(script_dir, 'datasets', 'Compiled_data.csv')

    with open(regression_model_path, 'rb') as f:
        regression_model = pkl.load(f)

    df_cols = pd.read_csv(compiled_data_csv)
    df_cols = df_cols.iloc[:, 1:]  # Drop first unnamed index column
    df_cols = df_cols.drop('IC50', axis=1, errors='ignore')
    cols = regression_model.feature_names_in_.tolist()

    y_pred = []
    for i in range(df.shape[0]):
        sample_df = pd.DataFrame(df.iloc[i, :]).T
        regression_df = pd.concat((df_cols, sample_df), axis=0)
        regression_df = regression_df.rank()
        sample_df_ranked = regression_df[cols].iloc[-1:]  # Select only the last (current sample)
        pred = regression_model.predict(sample_df_ranked)[0]
        y_pred.append(pred)

    # Coefficients for polynomial conversion to IC50 values
    coefficients = [7e-7, -0.00052, 0.1870, -10.123, 248.08]
    y_pred_ic50 = np.polyval(coefficients, y_pred)

    # Prepare results DataFrame
    result_df = df[cols].copy()
    result_df['IC50'] = y_pred_ic50

    return result_df

@app.route('/api/predict', methods=['POST'])
def predict():
    """
    Main prediction endpoint that processes SMILES strings and returns predictions.
    
    Process:
    1. Receives SMILES strings in JSON format
    2. Converts SMILES to molecular descriptors
    3. Preprocesses descriptors
    4. Classifies compounds as decoys or inhibitors
    5. For inhibitors, predicts potency class and IC50 values
    6. Returns structured prediction results
    
    Returns:
        JSON response containing predictions for each input SMILES string
    """
    try:
        # Get and validate input data
        data = request.get_json()
        if not data or 'smiles' not in data:
            return jsonify({'error': 'No SMILES strings provided'}), 400
        
        smiles_list = data['smiles']
        user_email = data.get('email', None)
        user_name = data.get('name', None)
        user_affiliation = data.get('affiliation', None)
        
        if not isinstance(smiles_list, list):
            return jsonify({'error': 'SMILES should be provided as a list'}), 400
        
        # Check if this is a large batch that requires email processing
        is_large_batch = len(smiles_list) > 20
        
        if is_large_batch and not user_email:
            return jsonify({'error': 'Email is required for batches larger than 20 compounds'}), 400
        
        # For large batches, handle user registration
        if is_large_batch:
            user_exists = check_user_exists(user_email)
            if not user_exists:
                # New user - name and affiliation are required
                if not user_name or not user_affiliation:
                    return jsonify({'error': 'Name and affiliation are required for new users'}), 400
                
                # Create new user in database
                if not create_user(user_email, user_name, user_affiliation):
                    return jsonify({'error': 'Failed to register user. Please try again.'}), 500

        # Define paths to data files
        script_dir = os.path.dirname(__file__)
        compiled_data_csv = os.path.join(script_dir, 'datasets', 'Compiled_data.csv')

        # Process SMILES through the prediction pipeline
        descriptors_df, important_descriptor_values = smiles_to_descriptors(smiles_list, compiled_data_csv)
        preprocessed_df = preprocessing(descriptors_df)
        di_df = decoy_inhibitor_classification(preprocessed_df.copy())
        
        # Separate decoys and inhibitors
        inhibitors_df = di_df[di_df['D/I'] == 1].drop('D/I', axis=1)
        decoys_df = di_df[di_df['D/I'] == 0].drop('D/I', axis=1)
        
        # Prepare response structure
        response = []
        
        # Add decoy predictions to response
        for idx, smiles in enumerate(smiles_list):
            if idx in decoys_df.index:
                response.append({
                    'smiles': smiles,
                    'classification': 'decoy',
                    'class': None,
                    'ic50': None,
                    'descriptors': important_descriptor_values[idx] if idx < len(important_descriptor_values) else {}
                })
        
        # Process inhibitors and add their predictions
        if not inhibitors_df.empty:
            classified_df = potency_classification(inhibitors_df.copy())
            regressed_df = ic50_regression(classified_df.copy())
            
            for idx, row in regressed_df.iterrows():
                if idx < len(smiles_list):  # Ensure index is within bounds
                    response.append({
                        'smiles': smiles_list[idx],
                        'classification': 'inhibitor',
                        'class': int(row['Class']),
                        'ic50': float(row['IC50']),
                        'descriptors': important_descriptor_values[idx] if idx < len(important_descriptor_values) else {}
                    })
        
        # Handle large batch processing with email
        if is_large_batch:
            # Process in background and send email
            def process_large_batch():
                try:
                    send_results_email(user_email, response)
                except Exception as e:
                    print(f"Error processing large batch: {str(e)}")
            
            # Start background processing
            thread = threading.Thread(target=process_large_batch)
            thread.daemon = True
            thread.start()
            
            return jsonify({
                'message': 'Large batch processing started. Results will be sent to your email.',
                'email': user_email,
                'compound_count': len(smiles_list)
            })
        else:
            return jsonify({'predictions': response})
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/check-user', methods=['POST'])
def check_user():
    """Check if user exists in database by email"""
    try:
        data = request.get_json()
        if not data or 'email' not in data:
            return jsonify({'error': 'Email is required'}), 400
        
        email = data['email'].strip()
        if not email:
            return jsonify({'error': 'Email cannot be empty'}), 400
        
        user_exists = check_user_exists(email)
        return jsonify({'exists': user_exists})
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)