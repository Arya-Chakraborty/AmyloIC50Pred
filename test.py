import smtplib
# creates SMTP session
s = smtplib.SMTP('smtp.gmail.com', 587)
# start TLS for security
s.starttls()
# Authentication
s.login("amyloic50pred@gmail.com", "Amyloidbeta5@")
# message to be sent
message = "This is a test mail"
# sending the mail
s.sendmail("amyloic50pred@gmail.com", "aryastlawrence@gmail.com", message)
# terminating the session
s.quit()